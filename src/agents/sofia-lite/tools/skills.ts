import { FunctionTool } from '@google/adk';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { PocLog } from '../../../adk/poc-log.js';

const here = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(here, '..', 'skills');

const ENABLED = ['info-institucional', 'depilacion-laser'] as const;

function skillMeta(name: string) {
  const skillMd = readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
  const titleMatch = skillMd.match(/^#\s+(.+)$/m);
  return {
    name,
    title: titleMatch?.[1]?.trim() ?? name,
    summary: skillMd.split('\n').slice(0, 8).join('\n'),
  };
}

export function createListSkillsTool(log: PocLog) {
  return new FunctionTool({
    name: 'list_skills',
    description: 'List available Sofía skills.',
    parameters: z.object({}),
    execute: async (_args, toolContext) => {
      log.event('tool_call', {
        name: 'list_skills',
        sessionId: toolContext?.sessionId,
      });
      return { skills: ENABLED.map((name) => skillMeta(name)) };
    },
  });
}

export function createLoadSkillTool(log: PocLog) {
  return new FunctionTool({
    name: 'load_skill',
    description: 'Load a skill SKILL.md by name.',
    parameters: z.object({
      skill_name: z.enum(ENABLED),
    }),
    execute: async (args, toolContext) => {
      log.event('tool_call', {
        name: 'load_skill',
        sessionId: toolContext?.sessionId,
        skill_name: args.skill_name,
      });
      const body = readFileSync(
        join(SKILLS_DIR, args.skill_name, 'SKILL.md'),
        'utf8',
      );
      const refs = readdirSync(
        join(SKILLS_DIR, args.skill_name, 'references'),
      ).filter((f) => f.endsWith('.md'));
      return {
        skill_name: args.skill_name,
        content: body,
        references: refs.map((f) => `references/${f}`),
      };
    },
  });
}

export function createLoadSkillResourceTool(log: PocLog) {
  return new FunctionTool({
    name: 'load_skill_resource',
    description: 'Load a skill reference markdown path (e.g. references/tecnologia.md).',
    parameters: z.object({
      skill_name: z.enum(ENABLED),
      path: z.string(),
    }),
    execute: async (args, toolContext) => {
      const safe = args.path.replace(/^\/+/, '').replace(/\.\./g, '');
      if (!safe.startsWith('references/')) {
        throw new Error('path must be under references/');
      }
      log.event('tool_call', {
        name: 'load_skill_resource',
        sessionId: toolContext?.sessionId,
        skill_name: args.skill_name,
        path: safe,
      });
      const body = readFileSync(
        join(SKILLS_DIR, args.skill_name, safe),
        'utf8',
      );
      return { skill_name: args.skill_name, path: safe, content: body };
    },
  });
}
