import { BaseAgent, Workflow } from '@google/adk';
import { ChannelService } from '../channel/channel.service.js';
import { PocLog } from '../adk/poc-log.js';

export interface AgentDeps {
  channel: ChannelService;
  log: PocLog;
}

export type AgentRoot = BaseAgent | Workflow;

export type AgentFactory = (deps: AgentDeps) => Promise<AgentRoot>;
