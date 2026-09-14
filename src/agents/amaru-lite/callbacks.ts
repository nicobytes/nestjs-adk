import { Context, LlmRequest } from '@google/adk';
import { OUTBOUND_SEND_TOOLS } from '../channel-tools.js';

const BANT_MARKERS = [
  'interest_level',
  'budget_status',
  'explicit_human_request',
  'plan_and_date_confirmed',
  'bant_result',
] as const;

export function looksLikeBantJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.includes('interest_level')) {
    return false;
  }
  return BANT_MARKERS.some((marker) => trimmed.includes(marker));
}

/**
 * Strip internal BANT JSON blobs from model contents before the next call.
 * Mutates `request.contents` in place (ADK beforeModelCallback contract).
 */
export function stripInternalBantContents(params: {
  context: Context;
  request: LlmRequest;
}): undefined {
  const contents = params.request.contents;
  if (!Array.isArray(contents)) return undefined;

  params.request.contents = contents
    .map((content) => {
      if (!content.parts?.length) return content;
      const parts = content.parts.filter((part) => {
        if (typeof part.text !== 'string') return true;
        return !looksLikeBantJson(part.text);
      });
      if (parts.length === 0) return null;
      return { ...content, parts };
    })
    .filter((content): content is NonNullable<typeof content> => content !== null);

  return undefined;
}

/**
 * After an outbound send_* tool, stop the turn (no second model round).
 * Uses skipSummarization so isFinalResponse ends the LlmAgent loop.
 */
export function stopTurnAfterOutboundIntent(params: {
  tool: { name: string };
  args: Record<string, unknown>;
  context: Context;
  response: Record<string, unknown>;
}): Record<string, unknown> | undefined {
  if (!OUTBOUND_SEND_TOOLS.has(params.tool.name)) return undefined;
  params.context.actions.skipSummarization = true;
  params.context.actions.endOfAgent = true;
  return undefined;
}
