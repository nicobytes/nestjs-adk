import { BaseAgent, LlmAgent } from '@google/adk';
import { AgentDeps, AgentRoot } from '../types.js';
import { createActivateAgent } from './activate.js';
import { createBridgeAgent } from './bridge.js';
import { createCustomerAgent } from './customer.js';
import { AmaruLiteOrchestrator, AMARU_LITE_ID } from './orchestrator.js';
import { createQualifierAgent } from './qualifier.js';

export { AMARU_LITE_ID };

export function createAmaruLiteAgent(deps: AgentDeps): Promise<AgentRoot> {
  const qualifier = createQualifierAgent();
  const bridge = createBridgeAgent();
  const activate = createActivateAgent();
  const customer = createCustomerAgent(deps.channel, deps.log);
  return Promise.resolve(
    new AmaruLiteOrchestrator(qualifier, bridge, activate, customer),
  );
}

export function createAmaruLiteWithAgents(options: {
  qualifier: BaseAgent | LlmAgent;
  bridge: BaseAgent | LlmAgent;
  activate: BaseAgent | LlmAgent;
  customer: BaseAgent | LlmAgent;
}): AmaruLiteOrchestrator {
  return new AmaruLiteOrchestrator(
    options.qualifier,
    options.bridge,
    options.activate,
    options.customer,
  );
}
