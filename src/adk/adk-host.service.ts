import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BaseNode,
  DatabaseSessionService,
  Event,
  Gemini,
  isBaseAgent,
  isLlmAgent,
  isWorkflow,
  LlmAgent,
  Runner,
} from '@google/adk';
import { ChannelService } from '../channel/channel.service.js';
import { ChannelName } from '../channel/channel.types.js';
import { agentRegistry } from '../agents/registry.js';
import { AgentRoot } from '../agents/types.js';
import { DEFAULT_AGENT_ID, SESSION_DB_URL, USER_ID } from '../constants.js';
import {
  choiceResponseMessage,
  choiceTextMessage,
  findPendingChoice,
  isPaused,
  NUDGE_KIND,
  nudgeMessage,
  PublicEvent,
  replyText,
  toPublicEvent,
  UserTurn,
  visibleText,
} from './events.js';
import { PocLog } from './poc-log.js';

export interface TurnContext {
  agentId?: string;
  userId?: string;
  channel?: ChannelName;
  target?: string;
}

export interface RunView {
  sessionId: string;
  paused: boolean;
  replyText: string;
  functionCallId?: string;
  invocationId?: string;
  mechanism?: string;
  events: PublicEvent[];
  sessionEvents: PublicEvent[];
}

@Injectable()
export class AdkHostService implements OnModuleInit {
  readonly sessionService: DatabaseSessionService;
  private readonly runners = new Map<string, Runner>();
  private readonly agents = new Map<string, AgentRoot>();

  constructor(
    private readonly channel: ChannelService,
    private readonly log: PocLog,
    private readonly config: ConfigService,
    @Inject(SESSION_DB_URL) dbUrl: string,
  ) {
    ensureSqliteDir(dbUrl);
    this.sessionService = new DatabaseSessionService(dbUrl);
  }

  async onModuleInit(): Promise<void> {
    await this.sessionService.init();
    for (const [agentId, factory] of Object.entries(agentRegistry)) {
      const agent = await factory({ channel: this.channel, log: this.log });
      this.agents.set(agentId, agent);
      this.runners.set(
        agentId,
        new Runner({
          appName: agentId,
          agent,
          sessionService: this.sessionService,
        }),
      );
    }
  }

  runnerFor(agentId: string = DEFAULT_AGENT_ID): Runner {
    const runner = this.runners.get(agentId);
    if (!runner) {
      throw new NotFoundException(`Unknown agent: ${agentId}`);
    }
    return runner;
  }

  get runner(): Runner {
    return this.runnerFor();
  }

  async inbound(
    sessionId: string,
    text: string,
    context: TurnContext = {},
  ): Promise<RunView> {
    const agentId = context.agentId ?? DEFAULT_AGENT_ID;
    const userId = context.userId ?? USER_ID;
    this.channel.bind(sessionId, context.channel ?? 'fake', context.target);
    await this.ensureSession(agentId, sessionId, userId);
    const pending = await this.pendingChoice(agentId, sessionId, userId);
    if (pending) {
      this.log.event('resume', {
        sessionId,
        text,
        functionCallId: pending.functionCallId,
        invocationId: pending.invocationId,
        mechanism: 'LongRunningFunctionTool',
        status: 'text',
      });
      const yielded = await this.collect(
        agentId,
        sessionId,
        userId,
        choiceTextMessage(pending, text),
      );
      return {
        ...this.view(agentId, sessionId, userId, yielded),
        functionCallId: pending.functionCallId,
        invocationId: pending.invocationId,
        mechanism: 'LongRunningFunctionTool',
      };
    }
    const yielded = await this.collect(agentId, sessionId, userId, {
      role: 'user',
      parts: [{ text }],
    } satisfies UserTurn);
    return this.view(agentId, sessionId, userId, yielded);
  }

  async resume(
    sessionId: string,
    buttonId: string,
    context: TurnContext = {},
  ): Promise<RunView> {
    const agentId = context.agentId ?? DEFAULT_AGENT_ID;
    this.runnerFor(agentId);
    const userId = context.userId ?? USER_ID;
    this.channel.bind(sessionId, context.channel ?? 'fake', context.target);
    const pending = await this.pendingChoice(agentId, sessionId, userId);
    if (!pending) {
      throw new BadRequestException(
        `No paused ask_choice for session ${sessionId}`,
      );
    }
    this.log.event('resume', {
      sessionId,
      buttonId,
      functionCallId: pending.functionCallId,
      invocationId: pending.invocationId,
      mechanism: 'LongRunningFunctionTool',
    });
    const yielded = await this.collect(
      agentId,
      sessionId,
      userId,
      choiceResponseMessage(pending, buttonId),
    );
    return {
      ...this.view(agentId, sessionId, userId, yielded),
      functionCallId: pending.functionCallId,
      invocationId: pending.invocationId,
      mechanism: 'LongRunningFunctionTool',
    };
  }

  async nudge(
    sessionId: string,
    context: TurnContext & { hint?: string } = {},
  ): Promise<RunView> {
    const agentId = context.agentId ?? DEFAULT_AGENT_ID;
    const userId = context.userId ?? USER_ID;
    this.runnerFor(agentId);
    const session = await this.sessionService.getSession({
      appName: agentId,
      userId,
      sessionId,
    });
    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }
    const pending =
      findPendingChoice(session.events) || this.pendingFromChannel(sessionId);
    if (pending) {
      throw new ConflictException(`Paused ask_choice for session ${sessionId}`);
    }
    this.channel.bind(sessionId, 'whatsapp', context.target);
    const yielded = await this.collect(
      agentId,
      sessionId,
      userId,
      nudgeMessage(context.hint),
      { kind: NUDGE_KIND },
    );
    return this.view(agentId, sessionId, userId, yielded);
  }

  private async ensureSession(
    agentId: string,
    sessionId: string,
    userId: string,
  ): Promise<void> {
    this.runnerFor(agentId);
    await this.sessionService.getOrCreateSession({
      appName: agentId,
      userId,
      sessionId,
    });
  }

  private async collect(
    agentId: string,
    sessionId: string,
    userId: string,
    message: UserTurn,
    customMetadata?: Record<string, unknown>,
  ): Promise<Event[]> {
    const runner = this.runnerFor(agentId);
    this.bindModel(agentId);
    const yielded: Event[] = [];
    for await (const event of runner.runAsync({
      userId,
      sessionId,
      newMessage: message,
      customMetadata,
    })) {
      yielded.push(event);
      await this.observe(sessionId, event, { deferText: true });
    }
    // Long-running pause: do not send leftover model prose (spec H).
    if (!isPaused(yielded)) {
      const text = replyText(yielded);
      if (text) {
        await this.channel.sendText(sessionId, text);
      }
    }
    return yielded;
  }

  private bindModel(agentId: string): void {
    const root = this.agents.get(agentId);
    if (!root) return;
    const pending = llmAgentsWithStringModel(root);
    if (pending.length === 0) return;
    const apiKey = this.config.get<string>('GOOGLE_API_KEY');
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is required');
    }
    for (const agent of pending) {
      if (typeof agent.model !== 'string') continue;
      agent.model = new Gemini({ model: agent.model, apiKey });
    }
  }

  private async observe(
    sessionId: string,
    event: Event,
    options: { deferText?: boolean } = {},
  ): Promise<void> {
    for (const part of event.content?.parts ?? []) {
      if (part.functionCall) {
        this.log.event('tool_call', {
          sessionId,
          name: part.functionCall.name,
          functionCallId: part.functionCall.id,
          invocationId: event.invocationId,
        });
      }
    }
    if ((event.longRunningToolIds?.length ?? 0) > 0) {
      this.log.event('pause', {
        sessionId,
        invocationId: event.invocationId,
        longRunningToolIds: event.longRunningToolIds,
        mechanism: 'LongRunningFunctionTool',
      });
    }
    const text = visibleText(event);
    if (text && event.author && event.author !== 'user') {
      this.log.event('final_text', {
        sessionId,
        author: event.author,
        text,
      });
      if (!options.deferText) {
        await this.channel.sendText(sessionId, text);
      }
    }
  }

  private async pendingChoice(
    agentId: string,
    sessionId: string,
    userId: string,
  ) {
    const session = await this.sessionService.getSession({
      appName: agentId,
      userId,
      sessionId,
    });
    // Decision path: pending choice must come from durable session events.
    return session ? findPendingChoice(session.events) : undefined;
  }

  private pendingFromChannel(sessionId: string) {
    const buttons = this.channel
      .list(sessionId)
      .filter((message) => message.kind === 'buttons')
      .at(-1);
    const functionCallId = buttons?.payload.functionCallId;
    const invocationId = buttons?.payload.invocationId;
    if (
      typeof functionCallId !== 'string' ||
      typeof invocationId !== 'string'
    ) {
      return undefined;
    }
    return { functionCallId, invocationId, name: 'ask_choice' };
  }

  private async view(
    agentId: string,
    sessionId: string,
    userId: string,
    yielded: Event[],
  ): Promise<RunView> {
    const session = await this.sessionService.getSession({
      appName: agentId,
      userId,
      sessionId,
    });
    const pending = session ? findPendingChoice(session.events) : undefined;
    return {
      sessionId,
      paused: isPaused(yielded) || Boolean(pending),
      replyText: replyText(yielded),
      functionCallId: pending?.functionCallId,
      invocationId: pending?.invocationId,
      events: yielded.map(toPublicEvent),
      sessionEvents: (session?.events ?? []).map(toPublicEvent),
    };
  }
}

function llmAgentsWithStringModel(
  node: BaseNode,
  seen = new Set<BaseNode>(),
): LlmAgent[] {
  if (seen.has(node)) return [];
  seen.add(node);
  const found: LlmAgent[] = [];
  if (isLlmAgent(node) && typeof node.model === 'string') {
    found.push(node);
  }
  if (isBaseAgent(node)) {
    for (const child of node.subAgents) {
      found.push(...llmAgentsWithStringModel(child, seen));
    }
  }
  if (isWorkflow(node) && node.graph) {
    for (const child of node.graph.nodes) {
      found.push(...llmAgentsWithStringModel(child, seen));
    }
  }
  return found;
}

function ensureSqliteDir(dbUrl: string): void {
  if (!dbUrl.startsWith('sqlite://') || dbUrl === 'sqlite://:memory:') return;
  const file = dbUrl.slice('sqlite://'.length);
  if (!file || file === ':memory:') return;
  mkdirSync(dirname(file), { recursive: true });
}
