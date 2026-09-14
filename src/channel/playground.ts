import { ChoiceOption } from './channel.types.js';
import { PublicEvent } from '../adk/events.js';

export interface PlaygroundPart {
  text?: string;
  functionResponse?: {
    id?: string;
    name?: string;
    response?: unknown;
  };
}

export interface PlaygroundMessage {
  role?: string;
  parts?: PlaygroundPart[];
}

export type PlaygroundIntent =
  | { kind: 'text'; text: string }
  | { kind: 'choice'; buttonId: string }
  | { kind: 'invalid'; reason: string };

export function playgroundIntent(
  message: PlaygroundMessage | undefined,
  options: ChoiceOption[] = [],
): PlaygroundIntent {
  const parts = message?.parts ?? [];
  const response = parts.find(
    (part) => part.functionResponse,
  )?.functionResponse;
  if (response) {
    const buttonId = buttonIdFrom(response.response);
    if (!buttonId) {
      return {
        kind: 'invalid',
        reason: 'playground functionResponse needs response.buttonId',
      };
    }
    return { kind: 'choice', buttonId };
  }

  const text = parts
    .map((part) => part.text)
    .filter((part): part is string => Boolean(part))
    .join('\n')
    .trim();
  if (!text) {
    return {
      kind: 'invalid',
      reason: 'playground message needs text or a button response',
    };
  }
  const clicked = options.find((option) => option.id === text);
  if (clicked) return { kind: 'choice', buttonId: clicked.id };
  return { kind: 'text', text };
}

export function toPlaygroundEvent(event: PublicEvent) {
  return {
    id: event.id,
    author: event.author,
    invocationId: event.invocationId,
    longRunningToolIds: event.longRunningToolIds,
    ...(event.errorCode ? { errorCode: event.errorCode } : {}),
    ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}),
    ...(event.partial !== undefined ? { partial: event.partial } : {}),
    ...(event.timestamp !== undefined ? { timestamp: event.timestamp } : {}),
    ...(event.parts.length > 0
      ? {
          content: {
            role: event.author === 'user' ? 'user' : 'model',
            parts: event.parts,
          },
        }
      : {}),
  };
}

function buttonIdFrom(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const record = response as Record<string, unknown>;
  if (typeof record.buttonId === 'string' && record.buttonId)
    return record.buttonId;
  if (typeof record.id === 'string' && record.id) return record.id;
  return undefined;
}
