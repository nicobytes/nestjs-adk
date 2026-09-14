import { createEvent, isFinalResponse, SkillToolset } from '@google/adk';
import { describe, expect, it } from 'vitest';
import { customerInstruction, EveOrchestrator, createQualifierAgent, ToolErrorPlugin } from '../src/adk/feature-probe.agent.js';

describe('feature probe', () => {
  it('covers at least 6 of 8 reference APIs', async () => {
    const adk = await import('@google/adk');
    const qualifier = createQualifierAgent();
    const customer = adk.LlmAgent
      ? new adk.LlmAgent({ name: 'customer_probe', model: 'gemini-flash-latest' })
      : qualifier;
    const orchestrator = new EveOrchestrator(qualifier, customer);
    const plugin = new ToolErrorPlugin();
    const handled = await plugin.onToolErrorCallback({
      tool: { name: 'boom' } as never,
      toolArgs: {},
      toolContext: {} as never,
      error: new Error('boom'),
    });
    const toolset = new SkillToolset([
      {
        frontmatter: {
          name: 'poc-skill',
          description: 'Probe skill.',
          metadata: {},
        },
        instructions: 'Say probe.',
      },
    ]);
    const skillTools = await toolset.getTools();
    const skillNames = skillTools.map((tool) => tool.name);
    const pauseEvent = createEvent({
      author: 'customer',
      longRunningToolIds: ['call-1'],
      content: {
        role: 'model',
        parts: [{ functionCall: { id: 'call-1', name: 'ask_choice', args: {} } }],
      },
    });

    const checks = {
      A: typeof adk.BaseAgent === 'function' && orchestrator instanceof adk.BaseAgent && qualifier.tools.length === 0,
      B: typeof (adk as { BuiltInPlanner?: unknown }).BuiltInPlanner === 'function',
      C: isFinalResponse(pauseEvent) === true,
      D: customerInstruction({ sessionId: 's1' }).includes('sessionId=s1') && customerInstruction({ sessionId: 's1' }).includes('You are the customer agent'),
      E: qualifier.outputSchema !== undefined && qualifier.tools.length === 0,
      F: handled?.status === 'handled' && typeof adk.BasePlugin === 'function',
      G: typeof (adk as { ContextCacheConfig?: unknown }).ContextCacheConfig === 'function',
      H: skillNames.includes('list_skills') && skillNames.includes('load_skill'),
    };
    const score = Object.values(checks).filter(Boolean).length;

    expect(checks.A).toBe(true);
    expect(checks.B).toBe(false);
    expect(checks.C).toBe(true);
    expect(checks.D).toBe(true);
    expect(checks.E).toBe(true);
    expect(checks.F).toBe(true);
    expect(checks.G).toBe(false);
    expect(checks.H).toBe(true);
    expect(score).toBeGreaterThanOrEqual(6);
    expect(typeof adk.App).toBe('function');
    expect(adk.getUserChoiceTool).toBeDefined();
    expect(adk.requestInputTool).toBeDefined();
    expect(adk.LongRunningFunctionTool).toBeTypeOf('function');
  });
});
