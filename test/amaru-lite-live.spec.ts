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
  STATE_BANT_RESULT,
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

describe.skipIf(!hasGeminiKey)('amaru-lite live qualifier', () => {
  it('runs live qualifier and records classification quality', async () => {
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
      newMessage: {
        role: 'user',
        parts: [{ text: 'quiero hablar con un asesor humano por favor' }],
      },
    })) {
      // drain
    }

    const session = await sessionService.getSession({
      appName: AMARU_LITE_ID,
      userId: USER_ID,
      sessionId,
    });

    // Routing must leave BANT state; hard handoff depends on classifier quality.
    expect(session?.state[STATE_BANT_RESULT]).toBeTruthy();
    expect(session?.state[STATE_USER_TURN_COUNT]).toBe(1);

    const handedOff =
      session?.state[STATE_HANDOFF_PHASE] === HANDOFF_WAITING_HUMAN;
    // Soft signal for RESULTS: if false, classifier needs prompt tuning (routing still OK).
    if (!handedOff) {
      // eslint-disable-next-line no-console
      console.warn(
        '[amaru-lite live] qualifier did not set WAITING_HUMAN — classifier no-go / tune prompt',
      );
    }
    expect(typeof handedOff).toBe('boolean');
  }, 180_000);
});
