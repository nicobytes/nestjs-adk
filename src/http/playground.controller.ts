import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  type INestApplication,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AdkHostService, RunView } from '../adk/adk-host.service.js';
import { ChannelService } from '../channel/channel.service.js';
import { ChoiceOption } from '../channel/channel.types.js';
import { playgroundIntent, toPlaygroundEvent } from '../channel/playground.js';
import { agentIds, hasAgent } from '../agents/registry.js';
import { PlaygroundRunDto } from './playground.dto.js';

@Controller()
export class PlaygroundController {
  constructor(
    private readonly host: AdkHostService,
    private readonly channel: ChannelService,
  ) {}

  @Get('list-apps')
  listApps() {
    return agentIds();
  }

  @Get('version')
  version() {
    return { version: '2.0.0' };
  }

  @Get('dev/apps/:appName/debug/trace/session/:sessionId')
  sessionTraces() {
    return [];
  }

  @Get('dev/apps/:appName/eval_sets')
  evalSets(@Param('appName') appName: string) {
    this.assertApp(appName);
    return [];
  }

  @Get('dev/apps/:appName/eval_results')
  evalResults(@Param('appName') appName: string) {
    this.assertApp(appName);
    return [];
  }

  @Get('dev/apps/:appName/builder')
  @Header('Content-Type', 'text/plain')
  builder(@Param('appName') appName: string) {
    this.assertApp(appName);
    return '';
  }

  @Get('dev/apps/:appName/build_graph')
  buildGraph(@Param('appName') appName: string) {
    this.assertApp(appName);
    return { name: appName, root_agent: { name: appName, type: 'agent' } };
  }

  @Get('dev/apps/:appName/build_graph_image')
  buildGraphImage(@Param('appName') appName: string) {
    this.assertApp(appName);
    const dotSrc = `digraph { ${appName} [label="${appName}"]; }`;
    return { '': { dotSrc }, dotSrc };
  }

  @Post('apps/:appName/users/:userId/sessions')
  @HttpCode(200)
  createSession(
    @Param('appName') appName: string,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    const body = req.body as { state?: Record<string, unknown> } | null;
    const state = body && isState(body.state) ? body.state : {};
    return this.openSession(appName, userId, randomUUID(), state);
  }

  @Post('apps/:appName/users/:userId/sessions/:sessionId')
  @HttpCode(200)
  async createNamedSession(
    @Param('appName') appName: string,
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() state: Record<string, unknown> = {},
  ) {
    return this.openSession(
      appName,
      userId,
      sessionId,
      isState(state) ? state : {},
    );
  }

  private async openSession(
    appName: string,
    userId: string,
    sessionId: string,
    state: Record<string, unknown>,
  ) {
    this.assertApp(appName);
    this.channel.bind(sessionId, 'playground');
    try {
      return await this.host.sessionService.createSession({
        appName,
        userId,
        sessionId,
        state,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        throw new BadRequestException({
          detail: `Session already exists: ${sessionId}`,
        });
      }
      throw error;
    }
  }

  @Get('apps/:appName/users/:userId/sessions')
  async listSessions(
    @Param('appName') appName: string,
    @Param('userId') userId: string,
  ) {
    this.assertApp(appName);
    const listed = await this.host.sessionService.listSessions({
      appName,
      userId,
    });
    return listed.sessions;
  }

  @Get('apps/:appName/users/:userId/sessions/:sessionId')
  async getSession(
    @Param('appName') appName: string,
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    this.assertApp(appName);
    const session = await this.host.sessionService.getSession({
      appName,
      userId,
      sessionId,
    });
    if (!session) {
      throw new NotFoundException({ detail: `Session not found: ${sessionId}` });
    }
    return session;
  }

  @Delete('apps/:appName/users/:userId/sessions/:sessionId')
  @HttpCode(204)
  async deleteSession(
    @Param('appName') appName: string,
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    this.assertApp(appName);
    await this.host.sessionService.deleteSession({
      appName,
      userId,
      sessionId,
    });
  }

  @Post('run')
  @HttpCode(200)
  async run(@Body() body: PlaygroundRunDto) {
    return this.execute(body);
  }

  @Post('run_sse')
  @HttpCode(200)
  async runSse(@Body() body: PlaygroundRunDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    try {
      const events = await this.execute(body);
      for (const event of events) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.end();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'run failed';
      res.write(
        `data: ${JSON.stringify({ errorCode: '500', errorMessage, error: errorMessage })}\n\n`,
      );
      res.end();
    }
  }

  private async execute(body: PlaygroundRunDto) {
    this.assertApp(body.appName);
    const view = await this.dispatch(body);
    return view.events.map(toPlaygroundEvent);
  }

  private dispatch(body: PlaygroundRunDto): Promise<RunView> {
    const context = {
      userId: body.userId,
      channel: 'playground' as const,
      agentId: body.appName,
    };
    const intent = playgroundIntent(body.newMessage, this.pendingOptions(body.sessionId));
    if (intent.kind === 'invalid') {
      throw new BadRequestException({ detail: intent.reason });
    }
    if (intent.kind === 'choice') {
      return this.host.resume(body.sessionId, intent.buttonId, context);
    }
    return this.host.inbound(body.sessionId, intent.text, context);
  }

  private pendingOptions(sessionId: string): ChoiceOption[] {
    const buttons = this.channel
      .list(sessionId)
      .filter((message) => message.channel === 'playground' && message.kind === 'buttons')
      .at(-1);
    const options = buttons?.payload.options;
    if (!Array.isArray(options)) return [];
    return options.filter(
      (option): option is ChoiceOption =>
        Boolean(option) &&
        typeof option === 'object' &&
        typeof (option as ChoiceOption).id === 'string',
    );
  }

  private assertApp(appName: string): void {
    if (!hasAgent(appName)) {
      throw new NotFoundException({ detail: `Unknown app: ${appName}` });
    }
  }
}

function isState(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function playgroundUiDir(): string {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@google/adk-devtools');
  return join(dirname(entry), '../browser');
}

export function mountPlaygroundUi(app: INestApplication): void {
  const expressApp = app as NestExpressApplication;
  expressApp.useStaticAssets(playgroundUiDir(), {
    prefix: '/dev-ui',
    index: 'index.html',
    setHeaders(res, filePath) {
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'text/javascript');
      }
    },
  });
  expressApp.getHttpAdapter().getInstance().get('/', (_req, res) => {
    res.redirect(302, '/dev-ui/');
  });
}
