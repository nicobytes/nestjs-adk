import { Event, isFinalResponse } from '@google/adk';
import { ASK_CHOICE_TOOL } from '../constants.js';

export interface PublicPart {
  text?: string;
  thought?: boolean;
  functionCall?: { id?: string; name?: string; args?: unknown };
  functionResponse?: { id?: string; name?: string; response?: unknown };
}

export interface PublicEvent {
  id?: string;
  author?: string;
  invocationId: string;
  longRunningToolIds: string[];
  parts: PublicPart[];
  errorCode?: string;
  errorMessage?: string;
  partial?: boolean;
  timestamp?: number;
}

export interface PendingChoice {
  functionCallId: string;
  invocationId: string;
  name: string;
}

export function toPublicEvent(event: Event): PublicEvent {
  return {
    id: event.id,
    author: event.author,
    invocationId: event.invocationId,
    longRunningToolIds: [...(event.longRunningToolIds ?? [])],
    errorCode: event.errorCode,
    errorMessage: event.errorMessage,
    partial: event.partial,
    timestamp: event.timestamp,
    parts: (event.content?.parts ?? []).map((part) => ({
      text: part.text,
      thought: part.thought,
      functionCall: part.functionCall
        ? {
            id: part.functionCall.id,
            name: part.functionCall.name,
            args: part.functionCall.args,
          }
        : undefined,
      functionResponse: part.functionResponse
        ? {
            id: part.functionResponse.id,
            name: part.functionResponse.name,
            response: part.functionResponse.response,
          }
        : undefined,
    })),
  };
}

export function visibleText(event: Event): string {
  return (event.content?.parts ?? [])
    .filter((part) => part.text && !part.thought)
    .map((part) => part.text)
    .join('');
}

export function replyText(events: Event[]): string {
  const texts = events
    .filter((event) => event.author && event.author !== 'user')
    .map(visibleText)
    .filter(Boolean);
  return texts.at(-1) ?? '';
}

export function isPaused(events: Event[]): boolean {
  return events.some(
    (event) =>
      (event.longRunningToolIds?.length ?? 0) > 0 && isFinalResponse(event),
  );
}

export function findPendingChoice(events: Event[]): PendingChoice | undefined {
  const answered = new Set<string>();
  for (const event of events) {
    for (const part of event.content?.parts ?? []) {
      if (part.functionResponse?.id) answered.add(part.functionResponse.id);
    }
  }

  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    for (const part of event.content?.parts ?? []) {
      const call = part.functionCall;
      if (
        call?.id &&
        call.name === ASK_CHOICE_TOOL &&
        !answered.has(call.id) &&
        (event.longRunningToolIds ?? []).includes(call.id)
      ) {
        return {
          functionCallId: call.id,
          invocationId: event.invocationId,
          name: call.name,
        };
      }
    }
  }
  return undefined;
}

export const NUDGE_KIND = 'nudge';
export const NUDGE_PREFIX = 'OPERATOR_NUDGE';

export function nudgeMessage(hint?: string): UserTurn {
  const extra = hint?.trim() ? `\nHint: ${hint.trim()}` : '';
  return {
    role: 'user',
    parts: [
      {
        text: `${NUDGE_PREFIX}
The customer has not replied. Write one short follow-up in their language. Do not call tools. Do not invent that they already answered.${extra}`,
      },
    ],
  };
}

export interface UserTurn {
  role: 'user';
  parts: Array<{
    text?: string;
    functionResponse?: {
      id: string;
      name: string;
      response: Record<string, unknown>;
    };
  }>;
}

export function choiceResponseMessage(
  pending: PendingChoice,
  buttonId: string,
): UserTurn {
  return choiceReply(pending, { buttonId, status: 'selected' });
}

export function choiceTextMessage(
  pending: PendingChoice,
  text: string,
): UserTurn {
  return choiceReply(pending, { status: 'text', text });
}

function choiceReply(
  pending: PendingChoice,
  response: Record<string, unknown>,
): UserTurn {
  return {
    role: 'user',
    parts: [
      {
        functionResponse: {
          id: pending.functionCallId,
          name: pending.name,
          response,
        },
      },
    ],
  };
}
