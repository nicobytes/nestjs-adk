import { Inject, Injectable, Optional } from '@nestjs/common';
import { PocLog } from '../adk/poc-log.js';
import { CHANNEL_SINKS, INBOX_WRITER } from '../constants.js';
import { ConversationStore } from '../conversations/conversation.store.js';
import { InboxWriterService } from '../conversations/inbox-view.js';
import {
  BoundChannel,
  ChannelMessage,
  ChannelName,
  ChannelSink,
  ChoiceOption,
  ListPayload,
  LocationPayload,
  MediaPayload,
} from './channel.types.js';

@Injectable()
export class ChannelService {
  private readonly messages: ChannelMessage[] = [];
  private readonly bound = new Map<string, BoundChannel>();

  constructor(
    private readonly log: PocLog,
    @Inject(CHANNEL_SINKS) private readonly sinks: ChannelSink[],
    @Optional() private readonly store?: ConversationStore,
    @Optional()
    @Inject(INBOX_WRITER)
    private readonly inbox?: InboxWriterService,
  ) {}

  bind(sessionId: string, channel: ChannelName, target?: string): void {
    this.bound.set(sessionId, { channel, target });
  }

  sendButtons(
    sessionId: string,
    prompt: string,
    options: ChoiceOption[],
    meta: { functionCallId?: string; invocationId?: string } = {},
  ): Promise<ChannelMessage> {
    if (meta.functionCallId && this.store) {
      const first = this.store.tryMarkToolSent(
        meta.functionCallId,
        sessionId,
        'ask_choice',
      );
      if (!first) {
        const existing = this.list(sessionId)
          .filter((message) => message.kind === 'buttons')
          .at(-1);
        if (existing) return Promise.resolve(existing);
      }
    }
    return this.push(sessionId, 'buttons', { prompt, options, ...meta });
  }

  sendText(sessionId: string, text: string): Promise<ChannelMessage> {
    return this.push(sessionId, 'text', { text });
  }

  sendMedia(sessionId: string, media: MediaPayload): Promise<ChannelMessage> {
    return this.push(sessionId, 'media', { ...media });
  }

  sendLocation(
    sessionId: string,
    location: LocationPayload,
  ): Promise<ChannelMessage> {
    return this.push(sessionId, 'location', { ...location });
  }

  sendList(
    sessionId: string,
    prompt: string,
    options: {
      buttonLabel?: string;
      sections?: ListPayload['sections'];
      options?: ChoiceOption[];
    } = {},
  ): Promise<ChannelMessage> {
    const sections =
      options.sections ??
      (options.options?.length
        ? [{ title: 'Opciones', rows: options.options }]
        : undefined);
    if (!sections?.length) {
      throw new Error('sendList requires sections or options');
    }
    return this.push(sessionId, 'list', {
      prompt,
      buttonLabel: options.buttonLabel ?? 'Elegir',
      sections,
      ...(options.options ? { options: options.options } : {}),
    });
  }

  list(sessionId: string): ChannelMessage[] {
    return this.messages.filter((message) => message.sessionId === sessionId);
  }

  clear(sessionId?: string): void {
    if (!sessionId) {
      this.messages.length = 0;
      return;
    }
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].sessionId === sessionId) {
        this.messages.splice(i, 1);
      }
    }
  }

  private async push(
    sessionId: string,
    kind: ChannelMessage['kind'],
    payload: Record<string, unknown>,
  ): Promise<ChannelMessage> {
    const bound = this.bound.get(sessionId);
    const channel = bound?.channel ?? 'fake';
    const message: ChannelMessage = {
      sessionId,
      channel,
      kind,
      payload,
      at: new Date().toISOString(),
      target: bound?.target,
    };
    this.messages.push(message);
    this.log.event('channel_send', { sessionId, channel, kind, payload });
    this.inbox?.recordChannelMessage(sessionId, message);
    await this.deliver(message);
    return message;
  }

  private async deliver(message: ChannelMessage): Promise<void> {
    const sink = this.sinks.find((item) => item.channel === message.channel);
    if (!sink) return;
    await sink.deliver(message);
  }
}
