# RESULTS.md — Durable queue + ADK Runner go/no-go

**Date**: 2026-09-14  
**Spec**: `specs/001-durable-queue-poc/`  
**Queue name**: `nestjs-adk-messages` (do not reuse shared Redis queue `messages`)

| Pregunta | Resultado | Evidencia |
|----------|-----------|-----------|
| ¿HTTP acka y Bull corre el Runner? | **sí** | `test/queue-ack.spec.ts` — ack &lt; 100ms con turn 1.5s |
| ¿Job delayed sobrevive restart Nest? | **sí (con matices)** | `test/queue-restart.spec.ts` — job delay 2s + reopen app |
| ¿3 textos → 1 runAsync (buffer)? | **sí** | `test/queue-buffer.spec.ts` — batch |
| ¿Follow-up si llegó texto durante el job? | **sí** | `test/queue-buffer.spec.ts` — follow-up |
| ¿Otra conversación HTTP viva durante runAsync? | **sí** | `test/queue-isolation.spec.ts` — health + other inbound &lt; 200ms |
| **¿Vale la pena el processor vs run en el POST?** | **sí** | A1+A4; A3 covered; A2 (`attempts: 3`) configurado — re-validar retry bajo carga real |
| ¿Retry tras throw en processor? | **configurado / flaky en test** | `defaultJobOptions.attempts=3`; spy-based assert inestable en Vitest |
| ¿Pause Eve + clic = functionResponse **en job**? | **parcial** | Código en `TurnService.runButtonTurn` + resume host; tests live Gemini pendientes de correr con `GOOGLE_API_KEY` |
| ¿Pause sobrevive restart (session, no RAM)? | **diseño sí** | `pendingChoice` solo desde `session.events` (ya no ChannelService RAM) |
| ¿`conversations.id` = `sessionId`? | **sí** | `test/conversation-identity.spec.ts` |
| ¿HITL salta el Runner? | **sí** | `test/hitl-skip.spec.ts` — post-handoff no encola |
| ¿Operador entra a session sin LLM? | **implementado** | `TurnService.appendOperatorReply` + `appendEvent`; live assert con key pendiente |
| ¿CRM `messages` ≠ prompt history? | **sí** | dual-write + `test/channel-crm-mapping.spec.ts` |
| ¿Botones/listas/clic en `messages`? | **sí (botones/clic)** | Channel dual-write + stray click inbox |
| ¿Session result es gist, no Graph? | **sí (ask_choice)** | `return null` + `skipSummarization` |
| ¿Session args intent pequeño? | **sí** | sin cambio adverso en tool schema |
| ¿Resume optionId + choice CRM? | **sí** | `runButtonTurn` escribe choice + resume functionResponse |
| ¿Inbox sin parsear session.events? | **sí** | `toInbox()` |
| ¿Retry no duplica botones? | **sí** | `sent_tool_calls` + `test/channel-crm-mapping.spec.ts` idempotency |
| ¿Pause no duplica texto+botones? | **sí** | `observe` deferText + no sendText si `isPaused` |
| BuiltInPlanner / ContextCache | **ausente** | probe viejo; no re-testeado |
| **¿Go Runner+Bull en Chatty (un tenant, un agente verde)?** | **sí con condiciones** | Redis dedicado/queue name propio; SQLite stub; BUFFER_MS demo; worker in-process OK si A5 (pass aquí) |
| **¿Go port Amaru/Be Unique a TS?** | **no / más tarde** | planner + cache + orchestrator siguen bloqueando |

## Condiciones / notas

1. **Redis compartido**: un worker ajeno en cola `messages` robaba jobs (`No ai_agent configured…`). Esta POC usa `nestjs-adk-messages`.
2. **Worker**: `@Processor` Nest no arrancó de forma fiable bajo Vitest/ESM; se usa `Worker` BullMQ manual en `MessagesProcessor.onModuleInit`.
3. **ConversationStore** debe ser singleton (`@Global()` ConversationsModule).
4. Tests live Gemini (Eve pause/resume, operator fact recall) requieren `GOOGLE_API_KEY`.
5. Path de decisión: `POST /inbound` con `waId`. Legacy `sessionId` sync sigue para demos/tests viejos.

## Criterio

- **Go teórico (canal + cola + runner):** A1–A4, C, D, G, I (parcial), A5 pass → **sí con condiciones** arriba.
- **No-go de port Python agents:** se mantiene.
