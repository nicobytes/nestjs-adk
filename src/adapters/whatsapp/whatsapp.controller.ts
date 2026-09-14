import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { Request, Response } from 'express';
import { DEFAULT_AGENT_ID } from '../../constants.js';
import { AdkHostService } from '../../adk/adk-host.service.js';
import { PocLog } from '../../adk/poc-log.js';
import { WhatsAppAdapter } from './whatsapp.adapter.js';
import {
  inboundWindowClosed,
  parseWhatsAppSessionId,
  WhatsAppDirectory,
} from './whatsapp.directory.js';
import { WhatsAppIntent, whatsappIntents } from './whatsapp.mapper.js';
import { whatsappSignatureOk } from './whatsapp.signature.js';

export class WhatsAppNudgeDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsOptional()
  @IsString()
  hint?: string;
}

@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly host: AdkHostService,
    private readonly directory: WhatsAppDirectory,
    private readonly whatsapp: WhatsAppAdapter,
    private readonly config: ConfigService,
    private readonly log: PocLog,
  ) {}

  @Get('webhook')
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ) {
    const expected = this.config.get<string>('WHATSAPP_VERIFY_TOKEN');
    if (mode !== 'subscribe' || !expected || token !== expected || !challenge) {
      res.status(403).send('forbidden');
      return;
    }
    res.status(200).type('text/plain').send(challenge);
  }

  @Post('webhook')
  @HttpCode(200)
  webhook(@Req() req: RawBodyRequest<Request>, @Body() body: unknown) {
    this.assertSignature(req);
    for (const intent of whatsappIntents(body)) {
      if (!this.directory.take(intent.messageId)) continue;
      void this.dispatch(intent).catch((error: unknown) => {
        this.logFailure(intent, error);
      });
    }
    return { ok: true };
  }

  @Post('nudge')
  async nudge(@Body() body: WhatsAppNudgeDto) {
    const identity = parseWhatsAppSessionId(body.sessionId);
    if (!identity) {
      throw new BadRequestException(
        'sessionId must be whatsapp:{phoneNumberId}:{digits}',
      );
    }
    const inboundAt = this.directory.lastInboundAt(identity.sessionId);
    if (inboundWindowClosed(inboundAt)) {
      throw new ConflictException('WhatsApp customer window closed');
    }
    return this.host.nudge(identity.sessionId, {
      channel: 'whatsapp',
      userId: identity.userId,
      target: identity.target,
      agentId: this.config.get<string>('WHATSAPP_AGENT_ID') ?? DEFAULT_AGENT_ID,
      hint: body.hint,
    });
  }

  private async dispatch(intent: WhatsAppIntent): Promise<void> {
    const phoneNumberId =
      intent.phoneNumberId ??
      this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID') ??
      'unknown';
    const identity = this.directory.resolve(phoneNumberId, intent.from);
    this.directory.remember(identity.sessionId, intent.messageId);
    try {
      await this.whatsapp.indicateTyping(intent.messageId);
    } catch (error) {
      this.logger.error(error);
    }
    const context = {
      channel: 'whatsapp' as const,
      userId: identity.userId,
      target: identity.target,
      agentId: this.config.get<string>('WHATSAPP_AGENT_ID') ?? DEFAULT_AGENT_ID,
    };
    if (intent.kind === 'choice') {
      await this.host.resume(identity.sessionId, intent.buttonId, context);
      return;
    }
    await this.host.inbound(identity.sessionId, intent.text, context);
  }

  private logFailure(intent: WhatsAppIntent, error: unknown): void {
    this.log.event('channel_send', {
      channel: 'whatsapp',
      messageId: intent.messageId,
      error: error instanceof Error ? error.message : 'webhook dispatch failed',
    });
    this.logger.error(error);
  }

  private assertSignature(req: RawBodyRequest<Request>): void {
    const secret = this.config.get<string>('WHATSAPP_APP_SECRET');
    if (!secret) return;
    const header = req.header('x-hub-signature-256');
    const raw = req.rawBody;
    if (!raw || !whatsappSignatureOk(raw, header, secret)) {
      throw new UnauthorizedException();
    }
  }
}
