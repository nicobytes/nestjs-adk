import { BantSignals } from './gate.js';

export const STATE_USER_TURN_COUNT = 'user_turn_count';
export const STATE_ACTIVATE_PENDING = 'activate_pending';
export const STATE_BANT_RESULT = 'bant_result';
export const STATE_LEAD_QUALIFIES = 'lead_qualifies';
export const STATE_HANDOFF_PHASE = 'handoff_phase';
export const STATE_HANDOFF_REASON = 'handoff_reason';

export const HANDOFF_WAITING_HUMAN = 'WAITING_HUMAN';

export type AmaruLiteState = {
  user_turn_count?: number | string;
  activate_pending?: boolean | string;
  bant_result?: BantSignals;
  lead_qualifies?: boolean;
  handoff_phase?: string;
  handoff_reason?: string;
};

export function readTurnCount(state: Record<string, unknown>): number {
  const raw = state[STATE_USER_TURN_COUNT];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function isActivatePending(state: Record<string, unknown>): boolean {
  const raw = state[STATE_ACTIVATE_PENDING];
  return raw === true || raw === 'true';
}

export function readBantResult(
  state: Record<string, unknown>,
): BantSignals | undefined {
  const raw = state[STATE_BANT_RESULT];
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as BantSignals;
}
