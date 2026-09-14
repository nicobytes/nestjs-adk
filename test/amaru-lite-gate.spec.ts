import { describe, expect, it } from 'vitest';
import {
  decideHandoff,
  defaultBantSignals,
  HANDOFF_REASON_DISABILITY,
  HANDOFF_REASON_GROUP,
  HANDOFF_REASON_HUMAN,
  HANDOFF_REASON_PLAN_DATE,
} from '../src/agents/amaru-lite/gate.js';

describe('amaru-lite gate', () => {
  it('human request qualifies even on turn 1', () => {
    const decision = decideHandoff(
      defaultBantSignals({ explicit_human_request: true }),
      1,
    );
    expect(decision.qualifies).toBe(true);
    expect(decision.reason).toBe(HANDOFF_REASON_HUMAN);
  });

  it('disability qualifies even on turn 1', () => {
    const decision = decideHandoff(
      defaultBantSignals({ disability_access_inquiry: true }),
      1,
    );
    expect(decision.qualifies).toBe(true);
    expect(decision.reason).toBe(HANDOFF_REASON_DISABILITY);
  });

  it('plan and date confirmed does not qualify on turn 1', () => {
    const decision = decideHandoff(
      defaultBantSignals({
        plan_and_date_confirmed: true,
        budget_status: 'Aligned',
      }),
      1,
    );
    expect(decision.qualifies).toBe(false);
  });

  it('plan and date confirmed qualifies on turn 2+', () => {
    const decision = decideHandoff(
      defaultBantSignals({
        plan_and_date_confirmed: true,
        budget_status: 'Aligned',
      }),
      2,
    );
    expect(decision.qualifies).toBe(true);
    expect(decision.reason).toBe(HANDOFF_REASON_PLAN_DATE);
  });

  it('score 90 without a path does not qualify', () => {
    const decision = decideHandoff(
      defaultBantSignals({
        interest_level: 'High',
        has_decision_authority: true,
        purchase_urgency: 'Immediate',
      }),
      5,
    );
    expect(decision.qualifies).toBe(false);
  });

  it('insufficient budget blocks plan-and-date and custom group', () => {
    expect(
      decideHandoff(
        defaultBantSignals({
          plan_and_date_confirmed: true,
          budget_status: 'Insufficient',
        }),
        3,
      ).qualifies,
    ).toBe(false);
    expect(
      decideHandoff(
        defaultBantSignals({
          custom_group_accepted: true,
          budget_status: 'Insufficient',
        }),
        3,
      ).qualifies,
    ).toBe(false);
  });

  it('insufficient budget does not block human or disability', () => {
    expect(
      decideHandoff(
        defaultBantSignals({
          explicit_human_request: true,
          budget_status: 'Insufficient',
        }),
        1,
      ).qualifies,
    ).toBe(true);
    expect(
      decideHandoff(
        defaultBantSignals({
          disability_access_inquiry: true,
          budget_status: 'Insufficient',
        }),
        1,
      ).qualifies,
    ).toBe(true);
  });

  it('handoff reason priority is human then disability then group then plan', () => {
    const allPaths = defaultBantSignals({
      explicit_human_request: true,
      disability_access_inquiry: true,
      custom_group_accepted: true,
      plan_and_date_confirmed: true,
      budget_status: 'Aligned',
    });
    expect(decideHandoff(allPaths, 3).reason).toBe(HANDOFF_REASON_HUMAN);

    const noHuman = defaultBantSignals({
      disability_access_inquiry: true,
      custom_group_accepted: true,
      plan_and_date_confirmed: true,
      budget_status: 'Aligned',
    });
    expect(decideHandoff(noHuman, 3).reason).toBe(HANDOFF_REASON_DISABILITY);

    const groupAndPlan = defaultBantSignals({
      custom_group_accepted: true,
      plan_and_date_confirmed: true,
      budget_status: 'Aligned',
    });
    expect(decideHandoff(groupAndPlan, 3).reason).toBe(HANDOFF_REASON_GROUP);

    const planOnly = defaultBantSignals({
      plan_and_date_confirmed: true,
      budget_status: 'Aligned',
    });
    expect(decideHandoff(planOnly, 3).reason).toBe(HANDOFF_REASON_PLAN_DATE);
  });
});
