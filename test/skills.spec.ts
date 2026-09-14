import { loadSkillFromDir, SkillToolset, validateSkillDir } from '@google/adk';
import { describe, expect, it } from 'vitest';
import { ASK_CHOICE_SKILL_DIR } from '../src/agents/amaru/agent.js';

describe('skills', () => {
  it('loads ask-choice from SKILL.md', async () => {
    expect(await validateSkillDir(ASK_CHOICE_SKILL_DIR)).toEqual([]);

    const skill = await loadSkillFromDir(ASK_CHOICE_SKILL_DIR);
    const tools = await new SkillToolset([skill]).getTools();

    expect(skill.frontmatter.name).toBe('ask-choice');
    expect(skill.resources?.references?.['button-copy.md']).toContain('lowercase');
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['list_skills', 'load_skill', 'load_skill_resource']),
    );
  });
});