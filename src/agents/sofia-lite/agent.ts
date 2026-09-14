import { AgentDeps, AgentRoot } from '../types.js';
import { AmaruLiteOrchestrator } from '../amaru-lite/orchestrator.js';
import { createSofiaActivateAgent, createSofiaBridgeAgent } from './bridge.js';
import { createSofiaCustomerAgent } from './customer.js';
import { decideSofiaHandoff } from './gate.js';
import { createSofiaQualifierAgent } from './qualifier.js';

export const SOFIA_LITE_ID = 'sofia_lite';

export function createSofiaLiteAgent(deps: AgentDeps): Promise<AgentRoot> {
  return Promise.resolve(
    new AmaruLiteOrchestrator(
      createSofiaQualifierAgent(),
      createSofiaBridgeAgent(),
      createSofiaActivateAgent(),
      createSofiaCustomerAgent(deps.channel, deps.log),
      { name: SOFIA_LITE_ID, gate: decideSofiaHandoff },
    ),
  );
}
