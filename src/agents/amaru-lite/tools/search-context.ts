import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { PocLog } from '../../../adk/poc-log.js';

export const SEARCH_CONTEXT = 'search_context';

/** Fixture plans for the POC (no HTTP / RAG). */
export const FIXTURE_PLANS = [
  {
    title: 'Caminata Bogotá Cerros Orientales',
    price: 'COP 180.000',
    date: '2026-10-12',
    summary: 'Medio día de caminata guiada por los cerros de Bogotá.',
  },
  {
    title: 'Camping Sabana de Bogotá',
    price: 'COP 320.000',
    date: '2026-10-18',
    summary: 'Noche de camping cerca de la sabana con fogata y desayuno.',
  },
  {
    title: 'Cascadas de Choachí',
    price: 'COP 250.000',
    date: '2026-11-02',
    summary: 'Día completo a cascadas cerca de Choachí.',
  },
] as const;

const params = z.object({
  query: z.string().describe('Search query about plans or destinations.'),
  explore: z.boolean().optional(),
  plan_focus: z.string().optional(),
});

function filterPlans(query: string, planFocus?: string) {
  const q = query.toLowerCase();
  const focus = planFocus?.toLowerCase();
  let plans = FIXTURE_PLANS.filter((plan) => {
    const hay = `${plan.title} ${plan.summary}`.toLowerCase();
    if (focus) return hay.includes(focus);
    if (!q.trim()) return true;
    return (
      hay.includes(q) ||
      q.split(/\s+/).some((token) => token.length > 2 && hay.includes(token))
    );
  });
  if (plans.length === 0) {
    // Broad Bogotá / sabana queries still surface the fixture set.
    if (/bogot|sabana|plan|tour|caminat|camping/i.test(q)) {
      plans = [...FIXTURE_PLANS];
    }
  }
  return plans;
}

export function createSearchContextTool(log: PocLog) {
  return new FunctionTool({
    name: SEARCH_CONTEXT,
    description:
      'Search published travel plans. Returns a short plan list (fixture). Call before inventing any plan facts.',
    parameters: params,
    execute: async (args, toolContext) => {
      log.event('tool_call', {
        name: SEARCH_CONTEXT,
        sessionId: toolContext?.sessionId,
        query: args.query,
      });
      const plans = filterPlans(args.query, args.plan_focus);
      return {
        plan_count: plans.length,
        plans: plans.map((plan) => ({
          title: plan.title,
          price: plan.price,
          date: plan.date,
        })),
        content: plans
          .map(
            (plan) =>
              `• ${plan.title} — ${plan.price} — ${plan.date}: ${plan.summary}`,
          )
          .join('\n'),
      };
    },
  });
}
