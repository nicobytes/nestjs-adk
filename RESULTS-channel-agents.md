# RESULTS-channel-agents.md — Amaru / Sofía on Nest channel

**Date**: 2026-09-14  
**Plan**: POC channel agents (legacy Amaru / Be Unique → Nest `ChannelService`)  
**Agents**: `amaru_lite` (extended), `sofia_lite` (new)

| Pregunta | Resultado | Evidencia |
|----------|-----------|-----------|
| ¿Tools de canal gist / no Graph? | **sí** | `test/channel-tools.spec.ts` — `send_text` / `send_buttons` / `send_list` write channel; `functionResponse` null gist |
| ¿`send_list` existe? | **sí** | `ChannelService.sendList` + `kind: 'list'` + inbox map |
| ¿Qualifier live abre humano y discapacidad? | **sí** | `test/amaru-lite-live.spec.ts` — hard `WAITING_HUMAN` (qualifier model `gemini-3.6-flash`) |
| ¿Amaru usa fixture y no inventa planes? | **sí (fake)** | `test/amaru-lite-search.spec.ts` — `search_context` fixture → `send_text` |
| ¿Handoff marca ConversationStore? | **sí** | `test/handoff-store.spec.ts` — session `handoff_phase` → store `WAITING_HUMAN` |
| ¿Sofía saludo = botones sede? | **sí (fake)** | `test/sofia-lite.spec.ts` — `sofia greeting is sede buttons only` |
| ¿Sofía book = pin? | **sí (fake)** | `test/sofia-lite.spec.ts` — `send_sede_location` → channel `location`; gist `{ ok, sede }` |
| **¿Go cerebro+canal Nest para un tenant demo?** | **sí con fixture** | A1–A4 + A2 live green; RAG is fixture; no WhatsApp Graph required |
| **¿Go sustituir Vertex parseTurn en Chatty?** | **no** | Qualifier live OK in POC; last-mile Graph / CRM Chatty still out of scope |

## Criteria applied

- **Go demo Amaru en POC:** A1–A4 + A2 live verde — **met**.
- **Go demo Sofía en POC:** B fake verde — **met**.
- **No-go canal:** Graph in session or model still calls `reply_with_*` — **not met** (customer uses `send_text` + `search_context`).
- **No-go cerebro:** A2 live rojo — **not met** (live green after qualifier model pin).
- **No-go Chatty prod:** this plan never declares go for Vertex→in-process on Railway — **unchanged**.

## Notes

- Shared tools: [`src/agents/channel-tools.ts`](./src/agents/channel-tools.ts).
- Amaru prompts copied from [`legacy/amaru`](./legacy/amaru) under `src/agents/amaru-lite/instructions/`.
- Sofía skills min: `info-institucional`, `depilacion-laser` + fake agenda + sede pins from legacy Be Unique.
- Qualifier uses `outputKey: 'bant_result'`, `temperature: 0`, model **`gemini-3.6-flash`** (override `AMARU_QUALIFIER_MODEL`). `gemini-2.5-flash` 404s for new keys; `gemini-3.7-flash` was returning empty finals here.

## How to exercise

```bash
pnpm exec vitest run \
  test/channel-tools.spec.ts \
  test/amaru-lite-search.spec.ts \
  test/handoff-store.spec.ts \
  test/sofia-lite.spec.ts \
  test/amaru-lite-callbacks.spec.ts \
  test/amaru-lite-evals.spec.ts

# live A2
GOOGLE_API_KEY=… pnpm exec vitest run test/amaru-lite-live.spec.ts

curl -s localhost:3000/inbound -H 'content-type: application/json' \
  -d '{"sessionId":"<uuid>","agentId":"amaru_lite","text":"hola"}'

curl -s localhost:3000/inbound -H 'content-type: application/json' \
  -d '{"sessionId":"<uuid>","agentId":"sofia_lite","text":"hola"}'
```
