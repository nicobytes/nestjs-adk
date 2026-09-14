import { DEFAULT_AGENT_ID } from '../constants.js';
import { createAmaruAgent } from './amaru/agent.js';
import { createRoutingAgent, ROUTING_ID } from './routing/agent.js';
import {
  createSequentialFlowAgent,
  SEQUENTIAL_FLOW_ID,
} from './sequential-flow/agent.js';
import { AgentFactory } from './types.js';

export const agentRegistry: Record<string, AgentFactory> = {
  [DEFAULT_AGENT_ID]: createAmaruAgent,
  [SEQUENTIAL_FLOW_ID]: createSequentialFlowAgent,
  [ROUTING_ID]: createRoutingAgent,
};

export function agentIds(): string[] {
  return Object.keys(agentRegistry);
}

export function hasAgent(agentId: string): boolean {
  return Object.prototype.hasOwnProperty.call(agentRegistry, agentId);
}
