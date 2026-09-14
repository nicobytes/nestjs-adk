import { WhatsAppClient, GraphApiError } from '@kapso/whatsapp-cloud-api';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelMessage, ChannelSink } from '../../channel/channel.types.js';
import { PocLog } from '../../adk/poc-log.js';
import { WhatsAppApiError } from './whatsapp.errors.js';
import {
  toWhatsAppOutbounds,
  WhatsAppOutbound,
} from './whatsapp.mapper.js';

@Injectable()
export class WhatsAppAdapter implements ChannelSink {
  readonly channel = 'whatsapp' as const;

  constructor(
    private readonly config: ConfigService,
    private readonly log: PocLog,
  ) {}

  async deliver(message: ChannelMessage): Promise<void> {
    if (!message.target) {
      this.log.event('channel_send', {
        skipped: 'missing_target',
        sessionId: message.sessionId,
        channel: 'whatsapp',
      });
      return;
    }
    const outbounds = toWhatsAppOutbounds(message.target, message);
    const client = this.client();
    if (outbounds.length === 0 || !client) return;
    for (const outbound of outbounds) {
      await this.send(client, outbound);
    }
  }

  async indicateTyping(messageId: string): Promise<void> {
    if (!messageId) return;
    const client = this.client();
    if (!client) return;
    await this.send(client, {
      kind: 'read',
      messageId,
    });
  }

  private client(): WhatsAppClient | undefined {
    const token = this.config.get<string>('WHATSAPP_TOKEN');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    if (!token || !phoneNumberId) return undefined;
    return new WhatsAppClient({
      accessToken: token,
      graphVersion:
        this.config.get<string>('WHATSAPP_GRAPH_VERSION') ?? 'v21.0',
    });
  }

  private async send(
    client: WhatsAppClient,
    outbound: WhatsAppOutbound | { kind: 'read'; messageId: string },
  ): Promise<void> {
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    if (!phoneNumberId) return;
    try {
      if (outbound.kind === 'text') {
        await client.messages.sendText({
          phoneNumberId,
          to: outbound.to,
          body: outbound.body,
        });
        return;
      }
      if (outbound.kind === 'buttons') {
        await client.messages.sendInteractiveButtons({
          phoneNumberId,
          to: outbound.to,
          bodyText: outbound.bodyText,
          buttons: outbound.buttons,
        });
        return;
      }
      if (outbound.kind === 'list') {
        await client.messages.sendInteractiveList({
          phoneNumberId,
          to: outbound.to,
          bodyText: outbound.bodyText,
          buttonText: outbound.buttonText,
          sections: outbound.sections,
        });
        return;
      }
      if (outbound.kind === 'media') {
        await this.sendMedia(client, phoneNumberId, outbound);
        return;
      }
      if (outbound.kind === 'location') {
        await client.messages.sendLocation({
          phoneNumberId,
          to: outbound.to,
          location: {
            latitude: outbound.latitude,
            longitude: outbound.longitude,
            ...(outbound.name ? { name: outbound.name } : {}),
            ...(outbound.address ? { address: outbound.address } : {}),
          },
        });
        return;
      }
      await client.messages.markRead({
        phoneNumberId,
        messageId: outbound.messageId,
        typingIndicator: { type: 'text' },
      });
    } catch (error) {
      throw asWhatsAppError(error);
    }
  }

  private async sendMedia(
    client: WhatsAppClient,
    phoneNumberId: string,
    outbound: Extract<WhatsAppOutbound, { kind: 'media' }>,
  ): Promise<void> {
    const link = outbound.link;
    const caption = outbound.caption;
    if (outbound.mediaType === 'image') {
      await client.messages.sendImage({
        phoneNumberId,
        to: outbound.to,
        image: { link, ...(caption ? { caption } : {}) },
      });
      return;
    }
    if (outbound.mediaType === 'video') {
      await client.messages.sendVideo({
        phoneNumberId,
        to: outbound.to,
        video: { link, ...(caption ? { caption } : {}) },
      });
      return;
    }
    if (outbound.mediaType === 'audio') {
      await client.messages.sendAudio({
        phoneNumberId,
        to: outbound.to,
        audio: { link },
      });
      return;
    }
    await client.messages.sendDocument({
      phoneNumberId,
      to: outbound.to,
      document: {
        link,
        ...(caption ? { caption } : {}),
        ...(outbound.filename ? { filename: outbound.filename } : {}),
      },
    });
  }
}

function asWhatsAppError(error: unknown): unknown {
  if (!(error instanceof GraphApiError)) return error;
  const body =
    typeof error.raw === 'string' ? error.raw : JSON.stringify(error.raw ?? {});
  return new WhatsAppApiError(error.httpStatus, body);
}
