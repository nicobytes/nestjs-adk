import { BaseLlm, LlmRequest, LlmResponse } from '@google/adk';

/**
 * Deterministic BaseLlm for amaru-lite callback / gist probes (no Gemini).
 */
export class ScriptedLlm extends BaseLlm {
  private callIndex = 0;

  constructor(
    private readonly responses: Array<() => LlmResponse>,
    model = 'scripted-fake',
  ) {
    super({ model });
  }

  get calls(): number {
    return this.callIndex;
  }

  async *generateContentAsync(
    _llmRequest: LlmRequest,
    _stream?: boolean,
  ): AsyncGenerator<LlmResponse, void> {
    const factory = this.responses[this.callIndex] ?? this.responses.at(-1);
    this.callIndex += 1;
    if (!factory) {
      yield { content: { role: 'model', parts: [{ text: 'empty' }] } };
      return;
    }
    yield factory();
  }

  async connect(): Promise<never> {
    throw new Error('live connect out of scope');
  }
}
