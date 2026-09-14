import { createHmac, timingSafeEqual } from 'node:crypto';

export function whatsappSignatureOk(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const given = Buffer.from(header);
  const want = Buffer.from(expected);
  if (given.length !== want.length) return false;
  return timingSafeEqual(given, want);
}
