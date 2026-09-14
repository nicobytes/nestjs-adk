import { Injectable, NotFoundException } from '@nestjs/common';
import { createEvent } from '@google/adk';
import { AdkHostService, RunView } from '../adk/adk-host.service.js';
import { findPendingChoice } from '../adk/events.js';
import { ChannelService } from '../channel/channel.service.js';
import { DEFAULT_AGENT_ID, USER_ID } from '../constants.js';
import { ConversationStore } from '../conversations/conversation.store.js';

@Injectable()
export class TurnService {
  /** Test hook: throw once then succeed (A2). */
  failNextTextTurn = false;

  constructor(
    private readonly host: AdkHostService,
    private readonly store: ConversationStore,
    private readonly channel: ChannelService,
  ) {}

  async runTextTurn(input: {
    conversationId: string;
    text: string;
    agentId?: string;
  }): Promise<RunView | { skipped: true; reason: string }> {
    if (this.failNextTextTurn) {
      this.failNextTextTurn = false;
      throw new Error('simulated processor failure');
    }
    const conversation = this.store.getById(input.conversationId);
    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${input.conversationId}`);
    }
    const agentId = input.agentId ?? DEFAULT_AGENT_ID;
    this.channel.bind(conversation.id, 'fake', conversation.wa_id);
    const view = await this.host.inbound(conversation.id, input.text, {
      agentId,
      userId: USER_ID,
      channel: 'fake',
      target: conversation.wa_id,
    });
    return view;
  }

  async runButtonTurn(input: {
    conversationId: string;
    buttonId: string;
    agentId?: string;
  }): Promise<RunView | { skipped: true; reason: string; stored: boolean }> {
    const conversation = this.store.getById(input.conversationId);
    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${input.conversationId}`);
    }
    const agentId = input.agentId ?? DEFAULT_AGENT_ID;
    this.channel.bind(conversation.id, 'fake', conversation.wa_id);
    const session = await this.host.sessionService.getSession({
      appName: agentId,
      userId: USER_ID,
      sessionId: conversation.id,
    });
    const pending = session ? findPendingChoice(session.events) : undefined;
    const title = this.optionTitle(conversation.id, input.buttonId);
    this.store.insertMessage({
      conversationId: conversation.id,
      role: 'customer',
      kind: 'choice',
      body: title ?? input.buttonId,
      payload: { buttonId: input.buttonId },
      source: 'inbound',
    });
    if (!pending) {
      return { skipped: true, reason: 'no_pending_choice', stored: true };
    }
    return this.host.resume(conversation.id, input.buttonId, {
      agentId,
      userId: USER_ID,
      channel: 'fake',
      target: conversation.wa_id,
    });
  }

  async appendOperatorReply(conversationId: string, text: string): Promise<void> {
    const conversation = this.store.getById(conversationId);
    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${conversationId}`);
    }
    this.channel.bind(conversation.id, 'fake', conversation.wa_id);
    await this.channel.sendText(conversation.id, text);
    this.store.insertMessage({
      conversationId,
      role: 'operator',
      kind: 'text',
      body: text,
      payload: {},
      source: 'operator',
    });
    const agentId = DEFAULT_AGENT_ID;
    const session = await this.host.sessionService.getOrCreateSession({
      appName: agentId,
      userId: USER_ID,
      sessionId: conversationId,
    });
    await this.host.sessionService.appendEvent({
      session,
      event: createEvent({
        author: 'user',
        content: {
          role: 'user',
          parts: [{ text: `Operator: ${text}` }],
        },
      }),
    });
  }

  private optionTitle(conversationId: string, buttonId: string): string | undefined {
    const messages = this.store.listMessages(conversationId);
    for (let i = messages.length - 1; i >= 0; i--) {
      const row = messages[i];
      if (row.kind !== 'buttons') continue;
      const payload = JSON.parse(row.payload_json) as {
        options?: Array<{ id: string; title: string }>;
      };
      const match = payload.options?.find((option) => option.id === buttonId);
      if (match) return match.title;
    }
    const channelButtons = this.channel
      .list(conversationId)
      .filter((message) => message.kind === 'buttons')
      .at(-1);
    const options = channelButtons?.payload.options as
      | Array<{ id: string; title: string }>
      | undefined;
    return options?.find((option) => option.id === buttonId)?.title;
  }
}
