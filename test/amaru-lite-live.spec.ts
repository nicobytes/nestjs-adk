import {
  BaseNode,
  Gemini,
  InMemorySessionService,
  isBaseAgent,
  isLlmAgent,
  Runner,
} from '@google/adk';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PocLog } from '../src/adk/poc-log.js';
import { createAmaruLiteAgent } from '../src/agents/amaru-lite/agent.js';
import { AMARU_LITE_ID } from '../src/agents/amaru-lite/orchestrator.js';
import {
  HANDOFF_WAITING_HUMAN,
  STATE_HANDOFF_PHASE,
  STATE_USER_TURN_COUNT,
} from '../src/agents/amaru-lite/state.js';
import { ChannelService } from '../src/channel/channel.service.js';
import { MODEL, USER_ID } from '../src/constants.js';
import { hasGeminiKey } from './has-key.js';

function bindGemini(node: BaseNode, apiKey: string, seen = new Set<BaseNode>()) {
  if (seen.has(node)) return;
  seen.add(node);
  if (isLlmAgent(node) && typeof node.model === 'string') {
    node.model = new Gemini({ model: node.model || MODEL, apiKey });
  }
  if (isBaseAgent(node)) {
    for (const child of node.subAgents) {
      bindGemini(child, apiKey, seen);
    }
  }
}

function sessionState(
  session: { state?: unknown } | null | undefined,
): Record<string, unknown> | undefined {
  const state = session?.state;
  if (
    state &&
    typeof (state as { toRecord?: () => Record<string, unknown> }).toRecord ===
      'function'
  ) {
    return (state as { toRecord: () => Record<string, unknown> }).toRecord();
  }
  return state as Record<string, unknown> | undefined;
}

async function runLive(text: string) {
  const apiKey =
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    '';
  const channel = new ChannelService(new PocLog(), []);
  const root = await createAmaruLiteAgent({
    channel,
    log: new PocLog(),
  });
  bindGemini(root, apiKey);

  const sessionService = new InMemorySessionService();
  const sessionId = randomUUID();
  await sessionService.createSession({
    appName: AMARU_LITE_ID,
    userId: USER_ID,
    sessionId,
    state: { [STATE_USER_TURN_COUNT]: 0 },
  });
  const runner = new Runner({
    appName: AMARU_LITE_ID,
    agent: root,
    sessionService,
  });

  for await (const _ of runner.runAsync({
    userId: USER_ID,
    sessionId,
    newMessage: { role: 'user', parts: [{ text }] },
  })) {
    // drain
  }

  const session = await sessionService.getSession({
    appName: AMARU_LITE_ID,
    userId: USER_ID,
    sessionId,
  });
  return sessionState(session);
}

describe.skipIf(!hasGeminiKey)('amaru-lite live qualifier (A2)', () => {
  it('live human request sets WAITING_HUMAN', async () => {
    const state = await runLive(
      'quiero hablar con un asesor humano por favor',
    );
    expect(state?.[STATE_HANDOFF_PHASE]).toBe(HANDOFF_WAITING_HUMAN);
  }, 180_000);

  it('live disability sets WAITING_HUMAN', async () => {
    const state = await runLive(
      'viajo en silla de ruedas, ¿el plan es accesible para discapacidad?',
    );
    expect(state?.[STATE_HANDOFF_PHASE]).toBe(HANDOFF_WAITING_HUMAN);
  }, 180_000);
});
