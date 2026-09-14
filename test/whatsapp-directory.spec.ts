import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WhatsAppDirectory } from '../src/adapters/whatsapp/whatsapp.directory.js';

describe('whatsapp directory', () => {
  it('keeps seen message ids across a new store on the same sqlite file', () => {
    const dbUrl = `sqlite://./data/seen-${randomUUID()}.sqlite`;
    const first = new WhatsAppDirectory(dbUrl);
    const identity = first.resolve('phone-id', '5215512345678');
    expect(identity).toEqual({
      sessionId: 'whatsapp:phone-id:5215512345678',
      userId: 'whatsapp:phone-id:5215512345678',
      target: '5215512345678',
    });
    expect(first.take('wamid.1')).toBe(true);
    expect(first.take('wamid.1')).toBe(false);
    first.remember(identity.sessionId, 'wamid.1', '2020-01-01T00:00:00.000Z');
    first.close();

    const second = new WhatsAppDirectory(dbUrl);
    expect(second.take('wamid.1')).toBe(false);
    expect(second.take('wamid.2')).toBe(true);
    expect(second.lastInbound(identity.sessionId)).toBe('wamid.1');
    expect(second.lastInboundAt(identity.sessionId)).toBe(
      '2020-01-01T00:00:00.000Z',
    );
    second.close();
  });
});
