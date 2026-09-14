import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { SESSION_DB_URL } from '../../constants.js';

export interface WhatsAppIdentity {
  sessionId: string;
  userId: string;
  target: string;
}

@Injectable()
export class WhatsAppDirectory implements OnModuleDestroy {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(@Inject(SESSION_DB_URL) dbUrl: string) {
    this.db = openSqlite(dbUrl);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_seen (
        message_id TEXT PRIMARY KEY,
        at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS whatsapp_inbound (
        session_id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        at TEXT
      );
    `);
    ensureInboundAt(this.db);
  }

  resolve(phoneNumberId: string, from: string): WhatsAppIdentity {
    const target = from.replace(/\D/g, '') || from;
    const sessionId = `whatsapp:${phoneNumberId}:${target}`;
    return { sessionId, userId: sessionId, target };
  }

  take(messageId: string): boolean {
    const result = this.db
      .prepare(
        'INSERT OR IGNORE INTO whatsapp_seen (message_id, at) VALUES (?, ?)',
      )
      .run(messageId, new Date().toISOString());
    return result.changes === 1;
  }

  remember(
    sessionId: string,
    messageId: string,
    at = new Date().toISOString(),
  ): void {
    this.db
      .prepare(
        `INSERT INTO whatsapp_inbound (session_id, message_id, at) VALUES (?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           message_id = excluded.message_id,
           at = excluded.at`,
      )
      .run(sessionId, messageId, at);
  }

  lastInbound(sessionId: string): string | undefined {
    const row = this.db
      .prepare('SELECT message_id FROM whatsapp_inbound WHERE session_id = ?')
      .get(sessionId) as { message_id: string } | undefined;
    return row?.message_id;
  }

  lastInboundAt(sessionId: string): string | undefined {
    const row = this.db
      .prepare('SELECT at FROM whatsapp_inbound WHERE session_id = ?')
      .get(sessionId) as { at: string | null } | undefined;
    return row?.at ?? undefined;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  onModuleDestroy(): void {
    this.close();
  }
}

export const WHATSAPP_CUSTOMER_WINDOW_MS = 24 * 60 * 60 * 1000;

const SESSION_ID = /^whatsapp:([^:]+):(\d+)$/;

export function parseWhatsAppSessionId(
  sessionId: string,
): WhatsAppIdentity | undefined {
  const match = SESSION_ID.exec(sessionId);
  if (!match) return undefined;
  return { sessionId, userId: sessionId, target: match[2] };
}

export function inboundWindowClosed(
  at: string | undefined,
  now = Date.now(),
): boolean {
  if (!at) return false;
  const then = Date.parse(at);
  if (Number.isNaN(then)) return false;
  return now - then > WHATSAPP_CUSTOMER_WINDOW_MS;
}

function ensureInboundAt(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(whatsapp_inbound)').all() as {
    name: string;
  }[];
  if (!columns.some((column) => column.name === 'at')) {
    db.exec('ALTER TABLE whatsapp_inbound ADD COLUMN at TEXT');
  }
}

function openSqlite(dbUrl: string): DatabaseSync {
  if (dbUrl === 'sqlite://:memory:' || dbUrl === ':memory:') {
    return new DatabaseSync(':memory:');
  }
  const file = sqliteFile(dbUrl);
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout = 3000');
  return db;
}

function sqliteFile(dbUrl: string): string {
  if (!dbUrl.startsWith('sqlite://')) return dbUrl;
  const file = dbUrl.slice('sqlite://'.length);
  if (!file || file === ':memory:') {
    throw new Error(`WhatsApp directory needs a sqlite file: ${dbUrl}`);
  }
  return file;
}
