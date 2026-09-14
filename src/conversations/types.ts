export type ConversationStatus =
  | 'BOT_AUTO'
  | 'WAITING_HUMAN'
  | 'HUMAN_ACTIVE'
  | 'CLOSED';

export interface ConversationRow {
  id: string;
  status: ConversationStatus;
  wa_id: string;
  updated_at: string;
}

export type MessageRole = 'customer' | 'bot' | 'operator';
export type MessageKind =
  | 'text'
  | 'buttons'
  | 'list'
  | 'location'
  | 'media'
  | 'choice';

export interface InboxMessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  kind: MessageKind;
  body: string;
  payload_json: string;
  source: string | null;
  created_at: string;
}

export interface InsertInboxMessageInput {
  conversationId: string;
  role: MessageRole;
  kind: MessageKind;
  body: string;
  payload?: Record<string, unknown>;
  source?: string;
}
