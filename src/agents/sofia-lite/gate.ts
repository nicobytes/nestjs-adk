import {
  BantSignals,
  HANDOFF_REASON_HUMAN,
  HandoffDecision,
} from '../amaru-lite/gate.js';

/** Be Unique / Sofía: handoff only on explicit human request. */
export function decideSofiaHandoff(
  signals: BantSignals,
  _userTurnCount: number,
): HandoffDecision {
  if (signals.explicit_human_request) {
    return { qualifies: true, reason: HANDOFF_REASON_HUMAN };
  }
  return { qualifies: false };
}
