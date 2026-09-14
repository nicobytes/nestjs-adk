import { Injectable } from '@nestjs/common';
import { ChannelMessage } from '../channel/channel.types.js';
import { ConversationStore } from './conversation.store.js';
import { InboxMessageRow } from './types.js';

@Injectable()
export class InboxWriterService {
  constructor(private readonly store: ConversationStore) {}

  recordChannelMessage(conversationId: string, message: ChannelMessage): void {
    if (!this.store.getById(conversationId)) {
      return;
    }
    const mapped = mapChannelToInbox(message);
    if (!mapped) return;
    this.store.insertMessage({
      conversationId,
      role: 'bot',
      kind: mapped.kind,
      body: mapped.body,
      payload: mapped.payload,
      source: mapped.source,
    });
  }
}

export function toInbox(messages: InboxMessageRow[]) {
  return messages.map((row) => ({
    id: row.id,
    role: row.role,
    kind: row.kind,
    body: row.body,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    source: row.source,
    createdAt: row.created_at,
  }));
}

function mapChannelToInbox(message: ChannelMessage): {
  kind: 'text' | 'buttons' | 'list' | 'location' | 'media';
  body: string;
  payload: Record<string, unknown>;
  source?: string;
} | null {
  const payload = message.payload;
  switch (message.kind) {
    case 'text': {
      const text = String(payload.text ?? '');
      return { kind: 'text', body: text, payload: {} };
    }
    case 'buttons': {
      const prompt = String(payload.prompt ?? '');
      const options = (payload.options as Array<{ id: string; title: string }>) ?? [];
      return {
        kind: 'buttons',
        body: prompt,
        payload: {
          prompt,
          options,
          functionCallId: payload.functionCallId,
        },
        source: 'ask_choice',
      };
    }
    case 'location': {
      const name = String(payload.name ?? '');
      const latitude = payload.latitude;
      const longitude = payload.longitude;
      const body =
        name ||
        (latitude != null && longitude != null
          ? `${latitude},${longitude}`
          : 'location');
      return {
        kind: 'location',
        body,
        payload: {
          latitude,
          longitude,
          name: payload.name,
          address: payload.address,
        },
      };
    }
    case 'media': {
      const caption = String(payload.caption ?? payload.filename ?? 'media');
      return {
        kind: 'media',
        body: caption,
        payload: {
          url: payload.url,
          mimeType: payload.mimeType,
          caption: payload.caption,
        },
      };
    }
    default:
      return null;
  }
}
