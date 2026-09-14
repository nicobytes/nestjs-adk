import { Inject, Injectable } from '@nestjs/common';
import { PocLog } from '../adk/poc-log.js';
import { CHANNEL_SINKS } from '../constants.js';
import {
  BoundChannel,
  ChannelMessage,
  ChannelName,
  ChannelSink,
  ChoiceOption,
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

  list(sessionId: string): ChannelMessage[] {
    return this.messages.filter((message) => message.sessionId === sessionId);
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
    await this.deliver(message);
    return message;
  }

  private async deliver(message: ChannelMessage): Promise<void> {
    const sink = this.sinks.find((item) => item.channel === message.channel);
    if (!sink) return;
    await sink.deliver(message);
  }
}
