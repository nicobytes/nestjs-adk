import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { isLlmAgent, isWorkflow } from '@google/adk';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AdkHostService } from '../src/adk/adk-host.service.js';
import { agentIds } from '../src/agents/registry.js';
import { createRoutingAgent, ROUTING_ID } from '../src/agents/routing/agent.js';
import {
  createSequentialFlowAgent,
  extractDestination,
  parseRoute,
  SEQUENTIAL_FLOW_ID,
} from '../src/agents/sequential-flow/agent.js';
import { AgentDeps } from '../src/agents/types.js';
import { DEFAULT_AGENT_ID } from '../src/constants.js';
import { createPocApp } from './app-harness.js';

describe('agent catalog', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createPocApp(`sqlite://./data/agents-${randomUUID()}.sqlite`);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists the workflow apps next to amaru', () => {
    expect(agentIds()).toEqual(
      expect.arrayContaining([
        DEFAULT_AGENT_ID,
        SEQUENTIAL_FLOW_ID,
        ROUTING_ID,
      ]),
    );
  });

  it('rejects an unknown agent id', async () => {
    await request(app.getHttpServer())
      .post('/inbound')
      .send({
        sessionId: randomUUID(),
        text: 'hola',
        agentId: 'nope',
      })
      .expect(404);
  });

  it('defaults inbound to amaru', async () => {
    const host = app.get(AdkHostService);
    const runner = host.runnerFor(DEFAULT_AGENT_ID);
    vi.spyOn(runner, 'runAsync').mockImplementation(async function* () {
      // catalog lookup, not a live model turn
    });
    const lookup = vi.spyOn(host, 'runnerFor');

    await request(app.getHttpServer())
      .post('/inbound')
      .send({ sessionId: randomUUID(), text: 'hola' })
      .expect(201);

    expect(lookup).toHaveBeenCalledWith(DEFAULT_AGENT_ID);
    lookup.mockRestore();
  });
});

describe('workflow agent trees', () => {
  const deps = {} as AgentDeps;

  it('builds the manual sequential router and combo workers', async () => {
    const root = await createSequentialFlowAgent(deps);

    expect(root.name).toBe(SEQUENTIAL_FLOW_ID);
    expect(root.subAgents.map((agent) => agent.name)).toEqual([
      'router_agent',
      'day_trip_agent',
      'foodie_agent',
      'weekend_guide_agent',
      'transportation_agent',
    ]);
    expect(root.findAgent('router_agent')?.subAgents).toEqual([]);
    expect(parseRoute(" 'find_and_navigate_combo' ")).toBe(
      'find_and_navigate_combo',
    );
    expect(extractDestination('The best sushi is at **Jin Sho**.')).toBe(
      'Jin Sho',
    );
  });

  it('builds the routing agent with workflow graphs', async () => {
    const root = await createRoutingAgent(deps);
    expect(isWorkflow(root)).toBe(true);
    if (!isWorkflow(root) || !root.graph) {
      throw new Error('expected a routing workflow');
    }
    const findAndNavigate = root.graph.nodes.find(
      (node) => node.name === 'find_and_navigate_agent',
    );
    const foodie = isWorkflow(findAndNavigate)
      ? findAndNavigate.graph?.nodes.find((node) => node.name === 'foodie_agent')
      : undefined;

    expect(root.name).toBe(ROUTING_ID);
    expect(root.graph.nodes.map((node) => node.name)).toEqual(
      expect.arrayContaining([
        'route_picker',
        'weekend_guide_workflow',
        'day_trip_workflow',
        'find_and_navigate_agent',
      ]),
    );
    expect(isWorkflow(findAndNavigate)).toBe(true);
    expect(
      isWorkflow(findAndNavigate)
        ? findAndNavigate.graph?.nodes.map((node) => node.name)
        : [],
    ).toEqual(expect.arrayContaining(['foodie_agent', 'transportation_agent']));
    expect(isLlmAgent(foodie) && foodie.outputKey).toBe('destination');
    expect(
      isWorkflow(
        root.graph.nodes.find((node) => node.name === 'day_trip_workflow'),
      ),
    ).toBe(true);
    expect(
      isWorkflow(
        root.graph.nodes.find((node) => node.name === 'weekend_guide_workflow'),
      ),
    ).toBe(true);
  });
});
