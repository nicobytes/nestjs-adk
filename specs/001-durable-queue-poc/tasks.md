# Tasks: Durable Queue Proof for Agent Conversations

**Input**: Design documents from `/specs/001-durable-queue-poc/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — the feature specification and quickstart mandate fixed named automated cases for the go/no-go verdict.

**Organization**: Tasks are grouped by user story (US1–US10) so each story can be implemented and validated independently. **Early stop**: if US1 (A1) or US2 (A4) fails after implementation, write RESULTS.md and stop — later stories do not justify the queue.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1–US10)
- Paths are repository-relative

## Path Conventions

Single Nest project: `src/`, `test/` at repository root (Vitest specs under `test/`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and module scaffolding for queue + conversation stub

- [x] T001 Add `bullmq` and Redis client dependencies to `package.json` (and lockfile via `pnpm i`)
- [x] T002 [P] Create directories `src/conversations/` and `src/queue/` per `specs/001-durable-queue-poc/plan.md`
- [x] T003 [P] Add `POC_DB_URL` and `REDIS_URL` (with localhost defaults) to `src/constants.ts`
- [x] T004 [P] Document Redis prerequisite and decision-path vs `/whatsapp/*` in `README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared stores, queue wiring, harness, and contract DTOs that every story needs

**⚠️ CRITICAL**: No user story work until this phase completes

- [x] T005 Implement SQLite ConversationStore (schema + find-or-create open by `wa_id`) in `src/conversations/conversation.store.ts`
- [x] T006 [P] Implement InboxMessage insert/list helpers in `src/conversations/message.store.ts`
- [x] T007 [P] Implement `sent_tool_calls` idempotency store in `src/conversations/sent-tool-call.store.ts`
- [x] T008 Wire `ConversationsModule` and register providers in `src/conversations/conversations.module.ts` and `src/app.module.ts`
- [x] T009 Create BullMQ `QueueModule` (queue name `messages`, Redis connection) in `src/queue/queue.module.ts` and import from `src/app.module.ts`
- [x] T010 Implement Redis text buffer helpers (`RPUSH`, atomic drain, `LLEN`) in `src/queue/message-buffer.ts`
- [x] T011 Create `TurnService` skeleton (methods for text turn / button resume; no controller calls to Runner) in `src/queue/turn.service.ts`
- [x] T012 Create `MessagesProcessor` skeleton (`WorkerHost` / `@Processor`) calling `TurnService` in `src/queue/messages.processor.ts`
- [x] T013 Extend `createPocApp` for `POC_DB_URL` + Redis overrides in `test/app-harness.ts`
- [x] T014 Add `GET /health` returning `{ ok: true }` in `src/http/health.controller.ts` and register in `src/app.module.ts`
- [x] T015 Update decision-path DTOs (`waId` inbound, `conversationId` interactive/operator) in `src/http/dto.ts` per `specs/001-durable-queue-poc/contracts/inbound-api.md`

**Checkpoint**: Foundation ready — user stories can proceed (prefer P1 order; stop after A1/A4 failure)

---

## Phase 3: User Story 1 - Channel acknowledged before agent finishes (Priority: P1) 🎯 MVP

**Goal**: HTTP ack &lt; 100ms with `conversationId`; turn runs in Bull with retry; delayed job survives Nest restart

**Independent Test**: Slow turn (~1.5s) still acks fast; forced fail then success within 3 attempts; close app with delayed job then reopen against same Redis + SQLite and job runs

### Tests for User Story 1

> Write tests first; ensure they fail before implementation

- [x] T016 [P] [US1] Add `it('returns http before the runner finishes')` in `test/queue-ack.spec.ts`
- [x] T017 [P] [US1] Add `it('retries a failed job and then runs the agent')` in `test/queue-retry.spec.ts`
- [x] T018 [P] [US1] Add `it('runs a delayed job after nest restart')` in `test/queue-restart.spec.ts`

### Implementation for User Story 1

- [x] T019 [US1] Change `POST /inbound` to find-or-create conversation, persist customer text, enqueue only (no `await runAsync`) in `src/http/inbound.controller.ts`
- [x] T020 [US1] Implement `TurnService` text path invoking `AdkHostService` with `sessionId = conversation.id` in `src/queue/turn.service.ts`
- [x] T021 [US1] Process jobs with `attempts: 3`, backoff ~1s, no `waitUntilFinished` in HTTP in `src/queue/messages.processor.ts`
- [x] T022 [US1] Return `{ conversationId, status, accepted: true }` within ack SLA from `src/http/inbound.controller.ts`

**Checkpoint**: US1 pass → continue. US1 A1 fail → fill RESULTS and stop.

---

## Phase 4: User Story 2 - Rapid texts become one turn (Priority: P1)

**Goal**: Debounce window ~400ms batches texts; follow-up drains mid-run arrivals; clicks not in text list

**Independent Test**: Three rapid POSTs → one `runAsync`; extra text during busy job appears in follow-up; button path separate

### Tests for User Story 2

- [x] T023 [P] [US2] Add `it('batches three inbound texts into one runAsync')` in `test/queue-buffer.spec.ts`
- [x] T024 [P] [US2] Add `it('follow-up job drains texts that arrived while the worker was busy')` in `test/queue-buffer.spec.ts`

### Implementation for User Story 2

- [x] T025 [US2] On text inbound: `RPUSH` + `queue.add` with `jobId = conversationId`, `delay = BUFFER_MS` (400) in `src/http/inbound.controller.ts` and `src/queue/message-buffer.ts`
- [x] T026 [US2] Drain list atomically, join texts with `\n`, single turn; if `LLEN > 0` after, enqueue follow-up `jobId = ${conversationId}-${Date.now()}` delay 0 in `src/queue/messages.processor.ts`
- [x] T027 [US2] Route `POST /inbound/interactive` to button jobs (`delay: 0`, not text buffer) in `src/http/inbound.controller.ts` and `src/queue/messages.processor.ts`

**Checkpoint**: US2 A4 fail → RESULTS and stop (queue not worth it).

---

## Phase 5: User Story 3 - Busy conversation does not freeze others (Priority: P1)

**Goal**: Measure whether yielding `runAsync` keeps other conversations responsive; document separate worker if not

**Independent Test**: During ~1.5s async wait turn, other conversation inbound or `GET /health` succeeds &lt; 200ms

### Tests for User Story 3

- [x] T028 [P] [US3] Add `it('serves another conversation while runAsync is in flight')` in `test/queue-isolation.spec.ts`

### Implementation for User Story 3

- [x] T029 [US3] Provide async-yielding delay path for A5 (tool or test double; no sync busy-loop) under `src/adk/` or `test/helpers/yielding-delay.ts`
- [x] T030 [US3] Record A5 pass/fail note template row for isolation / “worker aparte” in `RESULTS.md` (create stub file if missing)

**Checkpoint**: Isolation evidence recorded; do not build a separate worker process in this POC

---

## Phase 6: User Story 4 - Choice pause, resume, no spam (Priority: P1)

**Goal**: ask_choice on queue jobs; resume via functionResponse; restart-safe pending choice; click waits if turn active; stray click inbox-only; idempotent sendButtons; no leftover prose

**Independent Test**: Pause then click; restart between; retry after send; overlapping click serializes; stray click stored without agent

### Tests for User Story 4

- [x] T031 [P] [US4] Add `it('pauses on ask_choice in a queue job and resumes with functionResponse')` in `test/queue-eve.spec.ts` (`describe.skipIf(!hasGeminiKey)` as needed)
- [x] T032 [P] [US4] Add `it('resumes a paused choice after nest restart')` in `test/queue-eve-restart.spec.ts`
- [x] T033 [P] [US4] Add `it('ask_choice sendButtons is idempotent across job retry')` in `test/queue-ask-choice-idempotent.spec.ts`
- [x] T034 [P] [US4] Add `it('does not send extra text when ask_choice pauses')` in `test/queue-observe-pause.spec.ts`
- [x] T035 [P] [US4] Add overlapping-click wait test covering SC-017 in `test/queue-click-serialize.spec.ts`
- [x] T036 [P] [US4] Add `it` for stray click (no pending choice → inbox only) covering SC-018 in `test/queue-stray-click.spec.ts`

### Implementation for User Story 4

- [x] T037 [US4] Implement button job → `TurnService.resume` / `AdkHostService.resume` with pending from session events only (not ChannelService RAM alone) in `src/queue/turn.service.ts`
- [x] T038 [US4] Enforce per-conversation serialization so click jobs wait for active text turn in `src/queue/messages.processor.ts` (or mutex helper `src/queue/conversation-lock.ts`)
- [x] T039 [US4] Stray click: insert inbox `kind=choice`, skip agent in `src/queue/turn.service.ts`
- [x] T040 [US4] Gate `sendButtons` on `sent_tool_calls` by `functionCallId` in `src/adk/ask-choice.tool.ts` and `src/conversations/sent-tool-call.store.ts`
- [x] T041 [US4] Suppress leftover model prose on pause in `src/adk/adk-host.service.ts` (`observe`)

**Checkpoint**: Choice/resume/idempotency/prose rules green on decision path

---

## Phase 7: User Story 5 - Conversation is not channel identity (Priority: P2)

**Goal**: `conversations.id` is ADK session id; `wa_id` separate; close creates new session

**Independent Test**: Two `waId`s → two conversations; same `waId` reuses open; close then inbound → new UUID/session

### Tests for User Story 5

- [x] T042 [P] [US5] Add `it('uses conversation uuid as adk session id')` in `test/conversation-identity.spec.ts`

### Implementation for User Story 5

- [x] T043 [US5] Bind channel with `conversationId` + store `wa_id` for sink addressing in `src/queue/turn.service.ts` / `src/channel/channel.service.ts`
- [x] T044 [US5] Implement `POST /conversations/:id/close` → `CLOSED` in `src/http/conversations.controller.ts`
- [x] T045 [US5] Ensure find-or-create skips `CLOSED` and allocates new UUID + ADK session in `src/conversations/conversation.store.ts`

**Checkpoint**: Identity split proven; no `whatsapp:phone:digits` as session on decision path

---

## Phase 8: User Story 6 - Human takeover silences agent (Priority: P2)

**Goal**: Post-handoff inbound stores message and skips agent; already-scheduled jobs still run; release restores bot; no HUMAN_ACTIVE action

**Independent Test**: Handoff then inbound → no runner; set HUMAN_ACTIVE in store → same skip; scheduled job after handoff still runs; release then inbound runs agent

### Tests for User Story 6

- [x] T046 [P] [US6] Add `it('skips the runner when conversation is WAITING_HUMAN')` in `test/hitl-skip.spec.ts`
- [x] T047 [P] [US6] Add already-scheduled-job-still-runs-after-handoff case in `test/hitl-scheduled-job.spec.ts`

### Implementation for User Story 6

- [x] T048 [US6] Implement `POST /conversations/:id/handoff` → `WAITING_HUMAN` and `POST .../release` → `BOT_AUTO` in `src/http/conversations.controller.ts`
- [x] T049 [US6] At accept time only: if `WAITING_HUMAN`/`HUMAN_ACTIVE`, persist customer message and do not enqueue agent turn in `src/http/inbound.controller.ts`
- [x] T050 [US6] Ensure processor does not cancel already-scheduled jobs on status change (FR-020a) in `src/queue/messages.processor.ts` / `src/queue/turn.service.ts`

**Checkpoint**: HITL skip for new inbound; scheduled-job clarification honored

---

## Phase 9: User Story 7 - Operator reply visible to next agent turn (Priority: P2)

**Goal**: Operator text to channel + inbox + `appendEvent` without `runAsync`; next customer turn reflects fact

**Independent Test**: Operator “el precio es 100”; customer asks; reply mentions 100 (`skipIf` without key)

### Tests for User Story 7

- [x] T051 [P] [US7] Add `it('operator reply is visible to the next agent turn')` in `test/operator-append-event.spec.ts` (`describe.skipIf(!hasGeminiKey)`)

### Implementation for User Story 7

- [x] T052 [US7] Rewrite `POST /operator/reply` to use `conversationId`, `sendText`, inbox insert, `sessionService.appendEvent`, no `runAsync` in `src/http/operator.controller.ts`
- [x] T053 [US7] Add helper to build operator/user event for append in `src/adk/operator-event.ts` (or extend `src/adk/events.ts`)

**Checkpoint**: Dual-write to session without prompt injection

---

## Phase 10: User Story 8 - Inbox and agent memory stay separate (Priority: P2)

**Goal**: After text turn, both stores populated; agent reads only session; inbox only from messages; survive restart

**Independent Test**: Customer+bot inbox rows and session events; restart; prove no messages→prompt assembly

### Tests for User Story 8

- [x] T054 [P] [US8] Add `it('crm messages and adk session are dual-write not prompt injection')` in `test/dual-write-history.spec.ts`

### Implementation for User Story 8

- [x] T055 [US8] Persist customer + bot text inbox rows on successful BOT_AUTO text turn in `src/queue/turn.service.ts` and/or channel dual-write hook
- [x] T056 [US8] Optional `GET /conversations/:id/debug` returning messages + sessionEventCount + preview in `src/http/conversations.controller.ts`

**Checkpoint**: F rules demonstrable without Supabase

---

## Phase 11: User Story 9 - Operator sees channel; agent remembers gist (Priority: P2)

**Goal**: CRM payload_json for buttons/list/location/media/choice; session keeps small intent + gist/null; inbox renderable without parsing session

**Independent Test**: Named I tests for gist, args, choice row, location, inbox-only render

### Tests for User Story 9

- [x] T057 [P] [US9] Add `it('session tool result is a summary not channel json')` in `test/channel-crm-mapping.spec.ts`
- [x] T058 [P] [US9] Add `it('functionCall args stay small intent not graph')` in `test/channel-crm-mapping.spec.ts`
- [x] T059 [P] [US9] Add `it('stores buttons payload on messages when ask_choice sends')` in `test/channel-crm-mapping.spec.ts`
- [x] T060 [P] [US9] Add `it('resume writes optionId to session and choice row to messages')` in `test/channel-crm-mapping.spec.ts`
- [x] T061 [P] [US9] Add `it('location payload is in messages; session result is gist')` in `test/channel-crm-mapping.spec.ts`
- [x] T062 [P] [US9] Add `it('operator inbox does not require parsing session events')` in `test/channel-crm-mapping.spec.ts`

### Implementation for User Story 9

- [x] T063 [US9] Dual-write all channel sends (`sendText`/`sendButtons`/`sendLocation`/`sendMedia`) to inbox with FR-028 mapping in `src/channel/channel.service.ts`
- [x] T064 [US9] Keep `ask_choice` return `null` + `skipSummarization`; never persist interactive Graph in session in `src/adk/ask-choice.tool.ts`
- [x] T065 [US9] Add `toInbox(messages)` helper used by tests/debug in `src/conversations/inbox-view.ts`

**Checkpoint**: Inbox/gist split proven (I)

---

## Phase 12: User Story 10 - Written go/no-go record (Priority: P1)

**Goal**: RESULTS.md answers all architecture questions with evidence and overall recommendation

**Independent Test**: Reviewer can decide from RESULTS.md alone per FR-033–037

### Implementation for User Story 10

- [x] T066 [US10] Create `RESULTS.md` at repo root with the User Story 10 question table (empty results)
- [x] T067 [US10] Fill RESULTS.md from test outcomes (A–I, clarifications, BuiltInPlanner/cache note, processor worth-it, Chatty go, specialist port no/later)
- [x] T068 [US10] Link RESULTS.md and decision-path instructions from `README.md`

**Checkpoint**: Verdict written; early-stop rows allowed if A1/A4 failed earlier

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Docs and validation pass across stories

- [x] T069 [P] Align README Redis / `pnpm test` / live Gemini notes with `specs/001-durable-queue-poc/quickstart.md`
- [x] T070 Run full `pnpm test` (with and without `GOOGLE_API_KEY` as applicable) and fix regressions in `test/` and `src/`
- [x] T071 Verify no decision-path code uses `job.waitUntilFinished` or `waId` as ADK session id (grep + fix in `src/http/` and `src/queue/`)
- [x] T072 Mark Spec Kit feature checklist notes updated if needed in `specs/001-durable-queue-poc/checklists/requirements.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Start immediately
- **Foundational (Phase 2)**: After Setup — **blocks all stories**
- **US1 → US2 → US3**: Prefer sequential; **stop if A1 or A4 fail**
- **US4**: After US1–US2 (needs queue jobs); benefits from US5 identity but can use conversation UUID from foundation
- **US5–US9**: After foundation; best after US1 inbound shape exists; can parallelize across developers after US2
- **US10**: After experiments complete (or early stop)
- **Polish**: After desired stories + RESULTS

### User Story Dependencies

| Story | Depends on | Notes |
|-------|------------|--------|
| US1 | Phase 2 | MVP / A1–A3 |
| US2 | US1 enqueue path | A4; early-stop gate |
| US3 | US1 | A5 measurement |
| US4 | US1–US2 | Eve on jobs + clarifications |
| US5 | Phase 2 + US1 inbound | Close + identity |
| US6 | US5 statuses | HITL; FR-020a |
| US7 | US5 conversationId | appendEvent |
| US8 | US1 turn + inbox writes | Dual-write F |
| US9 | US4 ask_choice + channel | Mapping I |
| US10 | Evidence from above | RESULTS |

### Within Each User Story

- Tests first (fail), then implementation
- Stores/services before controllers where applicable
- Checkpoint before next priority when following early-stop rules

### Parallel Opportunities

- Phase 1: T002–T004 in parallel after T001
- Phase 2: T006–T007 parallel; T010–T012 after T009; T014–T015 parallel
- Per story: all `[P]` test tasks in that story can be written in parallel
- After US2: US5/US6/US7 can proceed on different files in parallel with care on `inbound.controller.ts` conflicts

---

## Parallel Example: User Story 1

```bash
# Tests in parallel:
Task: "Add it('returns http before the runner finishes') in test/queue-ack.spec.ts"
Task: "Add it('retries a failed job and then runs the agent') in test/queue-retry.spec.ts"
Task: "Add it('runs a delayed job after nest restart') in test/queue-restart.spec.ts"

# Then implementation sequentially on shared queue/http files:
Task: "Change POST /inbound enqueue-only in src/http/inbound.controller.ts"
Task: "Implement TurnService text path in src/queue/turn.service.ts"
Task: "Wire processor attempts/backoff in src/queue/messages.processor.ts"
```

---

## Parallel Example: User Story 9

```bash
Task: "Add session tool result gist test in test/channel-crm-mapping.spec.ts"
Task: "Add functionCall args test in test/channel-crm-mapping.spec.ts"
Task: "Add buttons payload CRM test in test/channel-crm-mapping.spec.ts"
# (same file — write as one PR/batch if single agent; [P] OK when splitting by describe blocks / files)
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 Setup  
2. Phase 2 Foundational  
3. Phase 3 US1 (A1–A3)  
4. **STOP and VALIDATE** — if A1 fails, RESULTS + halt  

### Incremental Delivery (recommended)

1. US1 → US2 (A4) → **gate**  
2. US3 (A5 note)  
3. US4 (Eve/idempotency/prose/clicks)  
4. US5 → US6 → US7 → US8 → US9  
5. US10 RESULTS + Polish  

### Early-stop rule

If A1 or A4 cannot pass without `waitUntilFinished` or without real debounce/follow-up, complete US10 RESULTS as **no-go / not worth processor** and skip remaining implementation stories.

---

## Notes

- Do not use `/whatsapp/*` or playground as RESULTS evidence  
- Do not clone Supabase/Chatty schema  
- Clarifications already in spec: click serializes; scheduled job survives handoff; ack returns `conversationId`; stray click inbox-only; no HUMAN_ACTIVE action  
- `[P]` = different files / no incomplete-task dependency; avoid parallel edits to the same controller without coordination  
- Total tasks: **T001–T072** (72)
