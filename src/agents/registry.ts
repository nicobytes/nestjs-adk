import { DEFAULT_AGENT_ID } from '../constants.js';
import { createAmaruAgent } from './amaru/agent.js';
import {
  AMARU_LITE_ID,
  createAmaruLiteAgent,
} from './amaru-lite/agent.js';
import { createRoutingAgent, ROUTING_ID } from './routing/agent.js';
import {
  createSequentialFlowAgent,
  SEQUENTIAL_FLOW_ID,
} from './sequential-flow/agent.js';
import {
  createSofiaLiteAgent,
  SOFIA_LITE_ID,
} from './sofia-lite/agent.js';
import { AgentFactory } from './types.js';

export const agentRegistry: Record<string, AgentFactory> = {
  [DEFAULT_AGENT_ID]: createAmaruAgent,
  [AMARU_LITE_ID]: createAmaruLiteAgent,
  [SOFIA_LITE_ID]: createSofiaLiteAgent,
  [SEQUENTIAL_FLOW_ID]: createSequentialFlowAgent,
  [ROUTING_ID]: createRoutingAgent,
};

export function agentIds(): string[] {
  return Object.keys(agentRegistry);
}

export function hasAgent(agentId: string): boolean {
  return Object.prototype.hasOwnProperty.call(agentRegistry, agentId);
}
