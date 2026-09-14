export type WhatsAppErrorCode =
  'RATE_LIMITED' | 'AUTH_FAILED' | 'PERMISSION_DENIED' | 'NOT_FOUND';

const RATE_LIMIT_CODES = new Set([
  4, 17, 32, 613, 80_007, 130_429, 131_048, 131_056,
]);
const AUTH_CODES = new Set([0, 190]);
const PERMISSION_CODES = new Set([3, 10]);

export class WhatsAppApiError extends Error {
  readonly status: number;
  readonly code?: WhatsAppErrorCode;

  constructor(status: number, body: string) {
    const graph = parseGraph(body);
    const code = classify(status, graph?.code);
    const summary = graph?.message ?? clip(body);
    super(`WhatsApp ${status}: ${summary}`);
    this.name = 'WhatsAppApiError';
    this.status = status;
    this.code = code;
  }
}

function classify(
  status: number,
  code: number | undefined,
): WhatsAppErrorCode | undefined {
  if (status === 429 || (code !== undefined && RATE_LIMIT_CODES.has(code))) {
    return 'RATE_LIMITED';
  }
  if (status === 401 || (code !== undefined && AUTH_CODES.has(code))) {
    return 'AUTH_FAILED';
  }
  if (
    status === 403 ||
    (code !== undefined &&
      (PERMISSION_CODES.has(code) || (code >= 200 && code <= 299)))
  ) {
    return 'PERMISSION_DENIED';
  }
  if (status === 404) return 'NOT_FOUND';
  return undefined;
}

function parseGraph(
  body: string,
): { code?: number; message?: string } | undefined {
  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: unknown; message?: unknown };
    };
    const error = parsed.error;
    if (!error || typeof error !== 'object') return undefined;
    return {
      code: typeof error.code === 'number' ? error.code : undefined,
      message: typeof error.message === 'string' ? error.message : undefined,
    };
  } catch {
    return undefined;
  }
}

function clip(body: string): string {
  return body.length > 500 ? `${body.slice(0, 500)}…` : body;
}
