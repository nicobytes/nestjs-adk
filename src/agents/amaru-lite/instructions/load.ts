import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function loadInstructionPair(
  agentFolder: 'customer' | 'qualifier' | 'bridge' | 'activate',
): string {
  const base = join(here, agentFolder);
  const personality = readFileSync(join(base, 'personality.md'), 'utf8').trim();
  const instructions = readFileSync(join(base, 'instructions.md'), 'utf8').trim();
  return `${personality}\n\n${instructions}`;
}

export function withSessionContext(
  staticInstruction: string,
  extras: Record<string, string | number> = {},
): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    staticInstruction,
    '',
    '## Session',
    `- today: ${today}`,
    ...Object.entries(extras).map(([key, value]) => `- ${key}: ${value}`),
  ];
  return lines.join('\n');
}
