# Implementation Plan: Durable Queue Proof for Agent Conversations

**Branch**: `001-durable-queue-poc` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-durable-queue-poc/spec.md`

## Summary

Prove go/no-go for putting the in-process `@google/adk` Runner behind a durable BullMQ queue in this Nest POC: immediate HTTP ack with `conversationId`, Redis text debounce + follow-up drain, retry/restart survival, Eve-style pause/resume on jobs, conversation UUID as ADK session id, HITL skip for post-handoff inbound, operator `appendEvent` dual-write, CRM `messages` vs session gist, and idempotent `ask_choice` side effects. Deliverable is RESULTS.md, not a Chatty/Supabase clone. Decision path is `/inbound` + queue + sqlite stub; WhatsApp Graph/playground stay out of scope for the verdict.

## Technical Context

**Language/Version**: TypeScript (Node.js), ESM (`"type": "module"`), NestJS 12

**Primary Dependencies**: `@nestjs/*` ^12, `@google/adk` ^2, BullMQ + Redis client, existing `@mikro-orm/sqlite` for ADK sessions; add a small SQLite access path for `conversations` / `messages` / `sent_tool_calls` (better-sqlite3 or raw driver — choose at implement time; keep separate from ADK session schema)

**Storage**: ADK `DatabaseSessionService` SQLite (`SESSION_DB_URL` / `./data/sessions.sqlite`); POC stub SQLite (`./data/poc.sqlite`); Redis for BullMQ + `buffer:{conversationId}` lists

**Testing**: Vitest + supertest + `@nestjs/testing`; extend `createPocApp`; real Bull worker preferred; `describe.skipIf(!hasGeminiKey)` for live model cases

**Target Platform**: Local macOS/Linux Nest process; Redis on localhost:6379 (Docker acceptable)

**Project Type**: Single Nest web-service POC (monolith process; separate worker only if A5 fails — document, do not build)

**Performance Goals**: Ack &lt; 100ms while turn ~1.5s; cross-conversation HTTP/health &lt; 200ms during yielding turn; debounce window ~400ms

**Constraints**: No `job.waitUntilFinished` in inbound; no timer-as-queue; no Supabase/Chatty schema; no live Meta Graph on decision path; early stop if A1/A4 fail or Redis blocked ~1h; clarifications Q1–Q5 (click serializes per conversation; scheduled job survives handoff; ack returns conversationId; stray click inbox-only; no HUMAN_ACTIVE action)

**Scale/Scope**: Demo fidelity, one org/agent; ~20 named automated cases + RESULTS.md; reuse existing ask_choice / pause-resume / ChannelService

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status |
|------|--------|
| Project constitution principles | **N/A** — `.specify/memory/constitution.md` is still an unfilled template; no enforceable gates beyond this feature’s FR/SC and source gaps brief |
| Spec quality (stakeholder WHAT/WHY) | Pass — plan may name Nest/Bull/ADK; implementation stays out of `spec.md` |
| No unjustified multi-project split | Pass — single Nest app |
| Early-stop / blocked Redis documented | Pass — research §1 / FR-040 |

**Post-design re-check**: Still N/A for constitution template. Design artifacts stay within single-app structure; contracts limited to decision-path HTTP; no production CRM schema.

## Project Structure

### Documentation (this feature)

```text
specs/001-durable-queue-poc/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── inbound-api.md
├── checklists/
│   └── requirements.md
└── tasks.md                 # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
src/
├── main.ts
├── app.module.ts
├── constants.ts
├── adk/                    # AdkHostService, ask-choice, events (reuse; tighten observe + appendEvent operator path)
├── agents/                 # amaru default for decision path
├── channel/                # ChannelService dual-write hook to inbox
├── http/                   # inbound/interactive/operator + new conversation actions; DTOs → waId / conversationId
├── conversations/          # NEW: ConversationStore (SQLite stub), status transitions
├── queue/                  # NEW: BullMQ module, MessagesProcessor, buffer helpers, TurnService
└── adapters/whatsapp/      # leave as non-decision demo

test/
├── app-harness.ts          # extend: Redis + poc sqlite overrides
├── has-key.ts
└── *.spec.ts               # A–I named cases (+ clarification cases)

data/
├── sessions.sqlite         # ADK
└── poc.sqlite              # conversations / messages / sent_tool_calls

RESULTS.md                  # go/no-go deliverable (repo root)
```

**Structure Decision**: Stay a single Nest application. Add `conversations/` and `queue/` modules beside existing `adk/`, `channel/`, and `http/`. Do not create a second deployable worker unless A5 fails (then only document). Keep WhatsApp adapter intact but out of RESULTS evidence.

## Complexity Tracking

> No constitution violations to justify. Intentional complexity vs today’s sync inbound:

| Choice | Why Needed | Simpler Alternative Rejected Because |
|--------|------------|-------------------------------------|
| BullMQ + Redis | Spec requires durable delay/retry/restart and Chatty-comparable buffer | `setTimeout` / fire-and-forget Promise fail A3/A4 and FR-040 |
| Separate poc.sqlite | Avoid fighting ADK MikroORM session schema | Stuffing CRM tables into session DB risks coupling and migrations pain |
| TurnService + processor | FR-011: agent not invoked from accept path | Controller→host sync is current fail mode for A1 |
| sent_tool_calls table | FR-015 idempotency across job retry | Memory Set lost on restart mid-retry |

## Phase 0 & Phase 1 outputs

- [research.md](./research.md) — queue, buffer, identity, appendEvent, dual-write, idempotency, HITL clarifications  
- [data-model.md](./data-model.md) — Conversation, InboxMessage, SentToolCall, Redis buffer, status transitions  
- [contracts/inbound-api.md](./contracts/inbound-api.md) — decision-path HTTP  
- [quickstart.md](./quickstart.md) — Redis, tests, RESULTS  

Next command: `/speckit-tasks`
