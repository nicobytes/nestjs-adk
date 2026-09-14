# RESULTS-port-python.md — Amaru brain port to `@google/adk` JS

**Date**: 2026-09-14  
**Plan**: `poc_adk_ts_python_port_parity.plan.md`  
**Agent id**: `amaru_lite` (opt-in; default inbound remains `amaru`)  
**Bull / queue verdict**: unchanged — see [RESULTS.md](./RESULTS.md)

| Pregunta | Resultado | Evidencia |
|----------|-----------|-----------|
| ¿Gate 4 caminos + turn-1 en TS sin LLM? | **sí** | `test/amaru-lite-gate.spec.ts` (8 cases) |
| ¿Orchestrator swallow qualifier? | **sí** | `test/amaru-lite-orchestrator.spec.ts` — no qualifier author / no BANT JSON on stream |
| ¿Handoff = solo bridge? | **sí** | orchestrator + evals — customer fake throws on handoff path |
| ¿Activate no bumpa turn y no corre customer? | **sí** | `activate_pending skips qualifier…` |
| ¿session.state sobrevive el routing? | **sí** | `bant_result` / `handoff_phase` / turn count via `stateDelta` |
| ¿Callback strip BANT existe? | **sí** | `beforeModelCallback` → `stripInternalBantContents` (`test/amaru-lite-callbacks.spec.ts`) |
| ¿Stop tras outbound? | **sí** | `afterToolCallback` + tool `skipSummarization`; ScriptedLlm shows 1 model call |
| ¿`thinkingConfig` sustituye BuiltInPlanner? | **parcial / aceptable en lab** | `generateContentConfig.thinkingConfig` with `includeThoughts: false`; BuiltInPlanner still absent |
| ¿Hay cache de static_instruction? | **no / N/A API** | No `staticInstruction`; no `ContextCacheConfig` on `App`; single `instruction` blob → expect full prefix each turn |
| ¿Evals handoff fake verdes? | **sí** | `test/amaru-lite-evals.spec.ts` (`es_*`) |
| ¿Qualifier live clasifica humano/discapacidad? | **no / hay que tunear prompt** | `test/amaru-lite-live.spec.ts` — run completed with `bant_result`, but `WAITING_HUMAN` not set for “quiero hablar con un asesor…” (routing OK, classifier no-go) |
| **¿Go port Amaru a TS (laboratorio)?** | **sí** | P0 + P1 + P2 + P4 fake green |
| **¿Go port a un tenant Chatty?** | **no / sí con condiciones** | Lab OK; last-mile CRM `WAITING_HUMAN`, activate Nest wire, `parseTurn` not in this POC |
| **¿Go port Be Unique (skills+agenda)?** | **no** | Forbidden until lab Amaru is accepted elsewhere; skills+agenda out of scope |

## P3 measurement notes

| Palanca Python | En `@google/adk` JS 2.0 | Evidencia | Impacto |
|---|---|---|---|
| `BuiltInPlanner(thinking_config)` | ausente | `test/amaru-lite-p3.spec.ts` + prior feature probe | Use `generateContentConfig.thinkingConfig`; not a 1:1 planner |
| `ContextCacheConfig` en `App` | ausente | same | No explicit context cache; personality re-sent each turn unless prompt is cut |
| `static_instruction` vs `instruction` | solo `instruction` string/fn | customer agent | One blob; Google context cache API not exposed |

Live token turn1 vs turn2 with ≥2k dummy prefix was **not** re-run in CI without a key. Conclusion for cost: **no-go barato 1:1** if Amaru’s static personality stays large; **routing still go**.

## Criteria applied

- **Go laboratorio:** P0 + P1 + P2 + P4 fake — **met**.
- **No-go cerebro:** would require P1 fail (no swallow / no state / no early-return) — **not met** (ADK supports all three).
- **No-go barato 1:1:** cache absent + large static — **cost flag**, separate from routing go.
- **No-go tenant Chatty:** lab OK but CRM/HITL/activate Nest last-mile not wired here.
- **Be Unique:** must stay **no**.

## Acceptable conditions

- Qualifier fake in CI; live classifier optional / flaky.
- `thinkingConfig` instead of `BuiltInPlanner`.
- No `ContextCacheConfig`.
- Handoff sets `session.state.handoff_phase = WAITING_HUMAN` only; Nest/Chatty CRM persistence stays outside the Runner (as in Python today).

## How to exercise

```bash
pnpm test -- test/amaru-lite-gate.spec.ts test/amaru-lite-orchestrator.spec.ts \
  test/amaru-lite-callbacks.spec.ts test/amaru-lite-evals.spec.ts test/amaru-lite-p3.spec.ts

# optional live
GOOGLE_API_KEY=… pnpm test -- test/amaru-lite-live.spec.ts

# opt-in agent (legacy session path)
curl -s localhost:3000/inbound -H 'content-type: application/json' \
  -d '{"sessionId":"<uuid>","agentId":"amaru_lite","text":"hola"}'
```
