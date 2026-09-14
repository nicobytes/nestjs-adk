# Research: Durable Queue Proof for Agent Conversations

**Branch**: `001-durable-queue-poc` | **Date**: 2026-09-14

## 1. Durable queue library

**Decision**: BullMQ (`bullmq`) with Redis (`localhost:6379`), wired via a Nest `@Processor` / `WorkerHost` (or equivalent Nest BullMQ module). Queue name `messages`.

**Rationale**: Matches the product pattern under evaluation (stable `jobId` per conversation, delayed jobs, retries, restart survival). Spec forbids substituting in-process timers for a durable queue. Existing WhatsApp path already acks then `void`s work; this proof needs real delayed jobs that survive Nest restart.

**Alternatives considered**:

| Option | Why rejected |
|--------|----------------|
| `@nestjs/bull` (Bull v3) | Older stack; BullMQ is the maintained successor |
| In-process `setTimeout` / Nest schedule | Spec FR-040: not a durable queue; fails A3 |
| Separate worker process from day one | Only justified if A5 fails; document, do not build in POC |
| SQLite-as-queue | Does not match Chatty comparison; no Redis jobId/delay semantics |

**Blocked path**: If Redis cannot be stood up within ~1 hour, mark queue items blocked in RESULTS and stop (no timer substitute).

---

## 2. Debounce / buffer pattern

**Decision**: Chatty-shaped buffer without copying Chatty code:

1. On text inbound: `RPUSH buffer:{conversationId}` + `queue.add('process', { conversationId, kind: 'text' }, { jobId: conversationId, delay: BUFFER_MS, attempts: 3, backoff: 1000 })`.
2. Duplicate `jobId` while delayed → BullMQ rejects; text still lands in the list. Accept that.
3. Processor: atomic drain (`MULTI` `LRANGE` + `DEL`, or Lua), join texts with `\n`, one `runAsync`.
4. After job finishes, if `LLEN > 0`, enqueue follow-up `jobId = ${conversationId}-${Date.now()}` with `delay: 0`.
5. `BUFFER_MS = 400` (tests).

**Button clicks**: Separate job `kind: 'button'`, `delay: 0`, `jobId` unique per click (or `${conversationId}:btn:${buttonId}:${ts}`). Spec clarification: if a turn is already active for that conversation, the click job must wait (BullMQ concurrency `1` per conversation via group/limiter or a per-conversation mutex / active-job flag). Do not mix clicks into the text list.

**Rationale**: Spec A4 + clarification Q1. Without follow-up drain, texts that arrive mid-run are lost (known Chatty failure).

**Alternatives considered**: One job per message (rejected — FR-036); debounce only in HTTP (rejected — no restart survival); Redis Streams consumer group (overkill for POC).

---

## 3. Turn entrypoint vs current host

**Decision**: Introduce a thin `TurnService` (name may vary) called **only** from the queue processor. Controllers for the decision path (`POST /inbound`, interactive, handoff, release, close) must not call `AdkHostService.inbound` / `runAsync` directly. Keep `AdkHostService` as the ADK Runner adapter; TurnService orchestrates conversation status checks, buffer drain inputs, and host calls.

**Clarification impact (Q2)**: Status for *new* inbound after takeover is checked at **accept** time (FR-020). An already-scheduled job still runs the agent (FR-020a) — processor must **not** re-check status to cancel that job. New follow-ups scheduled only after waiting-for-human must not start the agent.

**Rationale**: Spec FR-011; current code syncs HTTP to `AdkHostService.inbound` (A1 fail today).

**Alternatives considered**: Call host from controller with fire-and-forget Promise (fails A2/A3/A4); `job.waitUntilFinished` in HTTP (trampa — kills A1).

---

## 4. Conversation identity vs session

**Decision**: SQLite stub tables `conversations` + `messages` (second SQLite file or same directory as sessions; prefer `./data/poc.sqlite` separate from ADK `sessions.sqlite` to avoid fighting MikroORM schema). `conversation.id` (UUID) **is** ADK `sessionId`. `wa_id` stored on the row; stop using `whatsapp:{phone}:{digits}` as session id on the decision path.

**Inbound DTO change**: Accept `{ waId, text }` (and optional `agentId`). Find-or-create open conversation (`status != CLOSED`). Response `{ conversationId, ... }` (clarification Q3).

**Close**: `POST /conversations/:id/close` → `CLOSED`; next inbound for that `waId` creates a new UUID/session.

**Rationale**: Spec User Story 5 / FR-017–019. Product HITL hangs off conversation id.

**Alternatives considered**: Keep channel-derived session ids (product no-go); clone Supabase schema (explicitly out of scope).

---

## 5. Operator visibility into agent memory

**Decision**: Use existing ADK `sessionService.appendEvent` (already used in `test/whatsapp-nudge.spec.ts` with `createEvent`). Operator reply path: channel `sendText` + insert inbox `messages` role=operator + `appendEvent` user/operator-authored content **without** `runAsync`.

**Rationale**: Spec E / FR-022–023. Repo already proves `appendEvent` API exists on `DatabaseSessionService`.

**Alternatives considered**: Copy inbox into prompt history (FR-027 no-go); skip dual-write (silent product fail).

**Risk**: If the model ignores the appended event shape, RESULTS documents fail; do not fall back to prompt injection.

---

## 6. Channel → CRM dual-write and gist (toModelOutput analog)

**Decision**:

- Write inbox rows from a single place on outbound channel push (`ChannelService` send methods or a thin wrapper), using the kind/`payload_json` mapping in FR-028.
- Keep `ask_choice` returning `null` + `skipSummarization` (already in `src/adk/ask-choice.tool.ts`) so session does not store Graph/interactive JSON.
- Never persist Meta interactive / Block Kit equivalents into `session.events`.
- Stray click (no pending choice): inbox `kind=choice` only; no agent (clarification Q4).

**Rationale**: Spec User Story 9 / experiment I. ADK has no `toModelOutput`; null + skipSummarization is the established analog in this repo.

**Alternatives considered**: Parse session.events for operator UI (FR-025 fail); store Graph in session (FR-029 fail).

---

## 7. Idempotent `ask_choice` on retry

**Decision**: Persist sent side effects by `functionCallId` (SQLite `sent_tool_calls(id)` or equivalent unique key). On retry, if id already sent, skip `sendButtons`. Prefer this over relying solely on ADK not re-executing long-running tools.

**Rationale**: Spec G / FR-015. Bull retries the same job after a throw post-send.

**Alternatives considered**: Memory-only Set (fails Nest restart mid-retry); hope ADK skips re-execute (document if true, still add durable lock for POC certainty).

---

## 8. Pause without leftover prose

**Decision**: Adjust `AdkHostService.observe()` (or equivalent) so that when a turn ends paused / long-running, model prose is not `sendText`ed. Already partially true for tool path; tighten for ask_choice pause (spec H).

**Rationale**: Spec FR-016 / SC-009.

---

## 9. HITL status transitions

**Decision**: Takeover → `WAITING_HUMAN` only. No dedicated HTTP action for `HUMAN_ACTIVE` (clarification Q5). Tests may set `HUMAN_ACTIVE` via store for skip-rule coverage. Release → `BOT_AUTO`.

**Already-scheduled jobs after takeover**: Still run (FR-020a).

---

## 10. Testing harness

**Decision**: Extend `createPocApp` to inject Redis connection (or testcontainers/local Redis) and POC SQLite URL. Prefer real BullMQ worker in tests (A2). Use `describe.skipIf(!hasGeminiKey)` only for B/E/H/I cases that need the model to call `ask_choice` or reflect operator facts. Location/media inbox mapping may stub channel without Gemini.

**A5**: Async sleep in tool (`await` delay), not sync busy-loop. Measure second conversation HTTP or `GET /health` &lt; 200ms.

**Restart tests**: `app.close()`, new `createPocApp` same Redis + same SQLite files.

**Rationale**: Spec test names and SC-016; existing harness pattern in `test/app-harness.ts`.

---

## 11. Decision deliverable

**Decision**: Add `RESULTS.md` at repo root (or `specs/001-durable-queue-poc/RESULTS.md` — prefer **repo root** per source brief / README link). Fill the question table from User Story 10. Stop early if A1 or A4 fail.

**Rationale**: Spec FR-033–037; primary POC deliverable is go/no-go, not a shipped feature.

---

## 12. Constitution

**Decision**: Project constitution file is still a placeholder template. No enforceable Spec Kit gates apply beyond this feature’s own FR/SC and the source gaps plan.

**Rationale**: `.specify/memory/constitution.md` has unfilled principle placeholders.
