export type ChannelName = 'fake' | 'playground' | 'whatsapp' | 'telegram';

export interface ChoiceOption {
  id: string;
  title: string;
}

export interface MediaPayload {
  url: string;
  mimeType: string;
  caption?: string;
  filename?: string;
}

export interface LocationPayload {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export interface BoundChannel {
  channel: ChannelName;
  target?: string;
}

export interface ChannelMessage {
  sessionId: string;
  channel: ChannelName;
  kind: 'buttons' | 'text' | 'media' | 'location';
  payload: Record<string, unknown>;
  at: string;
  target?: string;
}

export interface ChannelSink {
  readonly channel: ChannelName;
  deliver(message: ChannelMessage): Promise<void>;
}
