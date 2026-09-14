import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { POC_DB_URL } from '../constants.js';
import {
  ConversationRow,
  ConversationStatus,
  InboxMessageRow,
  InsertInboxMessageInput,
} from './types.js';

@Injectable()
export class ConversationStore implements OnModuleDestroy {
  private readonly db: Database.Database;

  constructor(@Inject(POC_DB_URL) dbUrl: string) {
    const file = resolvePocFile(dbUrl);
    mkdirSync(dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        wa_id TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS conversations_wa_open
        ON conversations(wa_id) WHERE status != 'CLOSED';
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        kind TEXT NOT NULL,
        body TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        source TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );
      CREATE INDEX IF NOT EXISTS messages_conversation
        ON messages(conversation_id, created_at);
      CREATE TABLE IF NOT EXISTS sent_tool_calls (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  onModuleDestroy(): void {
    this.db.close();
  }

  findOpenByWaId(waId: string): ConversationRow | undefined {
    return this.db
      .prepare(
        `SELECT id, status, wa_id, updated_at FROM conversations
         WHERE wa_id = ? AND status != 'CLOSED'
         ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(waId) as ConversationRow | undefined;
  }

  getById(id: string): ConversationRow | undefined {
    return this.db
      .prepare(
        `SELECT id, status, wa_id, updated_at FROM conversations WHERE id = ?`,
      )
      .get(id) as ConversationRow | undefined;
  }

  findOrCreateOpen(waId: string): ConversationRow {
    const existing = this.findOpenByWaId(waId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const row: ConversationRow = {
      id: randomUUID(),
      status: 'BOT_AUTO',
      wa_id: waId,
      updated_at: now,
    };
    this.db
      .prepare(
        `INSERT INTO conversations (id, status, wa_id, updated_at) VALUES (?, ?, ?, ?)`,
      )
      .run(row.id, row.status, row.wa_id, row.updated_at);
    return row;
  }

  setStatus(id: string, status: ConversationStatus): ConversationRow {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?`,
      )
      .run(status, now, id);
    const row = this.getById(id);
    if (!row) throw new Error(`Conversation not found: ${id}`);
    return row;
  }

  touch(id: string): void {
    this.db
      .prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
  }

  insertMessage(input: InsertInboxMessageInput): InboxMessageRow {
    const row: InboxMessageRow = {
      id: randomUUID(),
      conversation_id: input.conversationId,
      role: input.role,
      kind: input.kind,
      body: input.body,
      payload_json: JSON.stringify(input.payload ?? {}),
      source: input.source ?? null,
      created_at: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO messages
         (id, conversation_id, role, kind, body, payload_json, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.conversation_id,
        row.role,
        row.kind,
        row.body,
        row.payload_json,
        row.source,
        row.created_at,
      );
    this.touch(input.conversationId);
    return row;
  }

  listMessages(conversationId: string): InboxMessageRow[] {
    return this.db
      .prepare(
        `SELECT id, conversation_id, role, kind, body, payload_json, source, created_at
         FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
      )
      .all(conversationId) as InboxMessageRow[];
  }

  tryMarkToolSent(
    functionCallId: string,
    conversationId: string,
    toolName: string,
  ): boolean {
    try {
      this.db
        .prepare(
          `INSERT INTO sent_tool_calls (id, conversation_id, tool_name, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(
          functionCallId,
          conversationId,
          toolName,
          new Date().toISOString(),
        );
      return true;
    } catch {
      return false;
    }
  }

  wasToolSent(functionCallId: string): boolean {
    const row = this.db
      .prepare(`SELECT id FROM sent_tool_calls WHERE id = ?`)
      .get(functionCallId);
    return Boolean(row);
  }
}

function resolvePocFile(dbUrl: string): string {
  if (dbUrl.startsWith('sqlite://')) {
    const file = dbUrl.slice('sqlite://'.length);
    return file || './data/poc.sqlite';
  }
  return dbUrl || './data/poc.sqlite';
}
