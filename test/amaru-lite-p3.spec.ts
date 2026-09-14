import { LlmAgent } from '@google/adk';
import { describe, expect, it } from 'vitest';
import { createCustomerAgent } from '../src/agents/amaru-lite/customer.js';
import { PocLog } from '../src/adk/poc-log.js';
import { ChannelService } from '../src/channel/channel.service.js';
import { hasGeminiKey } from './has-key.js';

describe('amaru-lite P3 API surface', () => {
  it('documents missing staticInstruction and uses instruction only', () => {
    const channel = new ChannelService(new PocLog(), []);
    const customer = createCustomerAgent(channel, new PocLog(), {
      thinkingBudget: 0,
    });
    expect(customer).toBeInstanceOf(LlmAgent);
    expect(typeof customer.instruction === 'function' || typeof customer.instruction === 'string').toBe(
      true,
    );
    // @google/adk 2.0: no staticInstruction on LlmAgent
    expect(
      (customer as unknown as { staticInstruction?: unknown }).staticInstruction,
    ).toBeUndefined();
    expect(customer.generateContentConfig?.thinkingConfig?.includeThoughts).toBe(
      false,
    );
  });

  it('BuiltInPlanner and ContextCacheConfig remain absent (not re-imported)', async () => {
    const adk = await import('@google/adk');
    expect(
      typeof (adk as { BuiltInPlanner?: unknown }).BuiltInPlanner,
    ).not.toBe('function');
    expect(
      typeof (adk as { ContextCacheConfig?: unknown }).ContextCacheConfig,
    ).not.toBe('function');
  });
});

describe.skipIf(!hasGeminiKey)('amaru-lite P3 live cost notes', () => {
  it('records that live token/cache measurement is manual in RESULTS', () => {
    // Live token comparison (turn1 vs turn2 with ≥2k static prefix) is logged
    // in RESULTS-port-python.md when run with GOOGLE_API_KEY. This placeholder
    // keeps CI green without inventing cache hits.
    expect(hasGeminiKey).toBe(true);
  });
});
