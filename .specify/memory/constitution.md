<!--
Sync Impact Report
- Version change: unversioned template placeholders → 1.0.0
- Modified principles:
  - [PRINCIPLE_1_NAME] → I. Proof Fidelity, Not Product Clone
  - [PRINCIPLE_2_NAME] → II. One Host, Many Adapters
  - [PRINCIPLE_3_NAME] → III. Evidence and Tests First (NON-NEGOTIABLE)
  - [PRINCIPLE_4_NAME] → IV. Dual Records: Inbox vs Agent Memory
  - [PRINCIPLE_5_NAME] → V. Durable Identity and Idempotent Side Effects
- Added sections:
  - Scope & Stack Constraints (replaced [SECTION_2_NAME])
  - Proof Workflow & Quality Gates (replaced [SECTION_3_NAME])
  - Governance (filled from [GOVERNANCE_RULES])
- Removed sections: none (template scaffold retained)
- Follow-up TODOs: none
-->

# nestjs-adk Constitution

## Core Principles

### I. Proof Fidelity, Not Product Clone

This repository exists to decide whether an in-process `@google/adk`
`Runner` behind a durable work queue is fit for a customer-messaging
product. Work MUST stay at demo fidelity. Cloning a production CRM
schema, multi-organization rules, row-level security, live
messaging-network production paths, or existing specialist-agent
ports is forbidden unless a ratified amendment expands scope.

Rationale: A production clone hides the architecture questions this
proof is meant to answer and delays the go / no-go.

### II. One Host, Many Adapters

The Nest process hosts the ADK `Runner` in-process. Playground, inbound
HTTP, operator actions, and WhatsApp are channel adapters on the shared
`ChannelService`. Product-path features MUST NOT spawn a separate
`npx adk web` (or equivalent) as the runtime. A new channel MUST
implement the sink contract and MUST NOT call the `Runner` directly.

Rationale: The proof is about one hosted runner with several
transports, not about the official ADK CLI as a second process.

### III. Evidence and Tests First (NON-NEGOTIABLE)

Architecture questions close only with a written decision record plus
reproducible tests. A story is not done because the code path exists.

- Go / no-go behaviors MUST have failing tests (or a recorded skipped
  live-model case) before implementation is treated as complete.
- Live Gemini tests MUST skip, not fail, when `GOOGLE_API_KEY` is unset.
- Already-proven behaviors (choice resume, send-during-tool, durable
  ADK session, operator bypass of the `Runner`) MUST be reused, not
  rebuilt.
- If a durable queue cannot be stood up within about one hour, the
  queue portion MUST be marked blocked. In-process delays MUST NOT
  substitute for a durable queue.

Rationale: The deliverable is a decision, not a feature shipped to
customers. Extra features without evidence do not finish the job.

### IV. Dual Records: Inbox vs Agent Memory

Each agent turn that affects the customer MUST write both records from
that turn:

- Inbox messages are the operator view and the source of truth for
  what was sent or received on the channel.
- Agent-memory events are what the agent reads on the next turn.

The agent MUST assemble next-turn history only from agent memory. The
operator inbox MUST be rendered only from inbox messages. Copying
inbox rows into the history the agent reads is a no-go. Agent memory
MUST NOT store the exact channel payload used to draw buttons, lists,
pins, or media; it MAY store small intent and a short gist of the
result.

Rationale: Inbox completeness and agent attention are different jobs.
Merging them produces either a blind operator or a noisy model.

### V. Durable Identity and Idempotent Side Effects

Conversation identity IS the agent session identity. Channel identity
is stored on the conversation and MUST NOT be encoded into the session
id. While a conversation is waiting-for-human or human-active, inbound
MUST be stored and the agent MUST NOT run or send bot outbound.

Tools and jobs that send on the channel MUST be safe under retry: a
retried turn MUST NOT send buttons or other side-effecting channel
items twice for the same request. Choice resume MUST record option
identity via a function response; typed stand-in text MUST NOT be the
only trace of a click. Pending choice MUST survive process restart
from durable agent memory, not from process-local memory alone.

Rationale: Queue retries, restarts, and human takeover are the reasons
this architecture is being proven. Duplicate sends or a lost pause
are automatic no-gos.

## Scope & Stack Constraints

The following constraints are non-negotiable for this proof unless
amended:

- Runtime: NestJS 12 hosting `@google/adk` in-process.
- Persistence: SQLite (or another local file store) for ADK sessions
  and a lightweight conversation stub (`conversations` + `messages`).
  Production databases are out of scope.
- Durable queue: a real durable backend (for example BullMQ with
  Redis). Short timers inside the application are not a queue.
- Channel: a simulated sink is enough for the decision path. Live
  WhatsApp Graph remains a sibling adapter and MUST NOT become the
  go / no-go path.
- Agents: default id is `amaru`. Routing and sequential-flow agents
  are demos. Porting production specialist agents remains no or later.
- Secrets: never commit API keys or channel tokens. Tests that need a
  live model read `GOOGLE_API_KEY` from the environment.

Complexity MUST be justified against a proof question. Features that
do not change a go / no-go answer MUST NOT be added.

## Proof Workflow & Quality Gates

Spec Kit is the planning path: specify → plan → tasks → implement.
Plans and tasks MUST trace to the feature spec; the constitution
supersedes conflicting plan language.

Quality gates before a proof story is complete:

- `pnpm test` passes (including skip-without-key live cases).
- `pnpm lint` is clean on touched TypeScript.
- Integration coverage exists for any of these that the story claims:
  inbound acknowledgement vs turn, burst grouping, restart survival,
  choice pause/resume, human-takeover skip, dual-write of inbox and
  agent memory, retry without a second channel send.
- The durable-queue proof MUST leave a written decision record
  answering the published architecture questions with evidence and an
  overall recommendation (yes, no, or yes-with-conditions).

An early stop with a documented no-go is a successful outcome. Piling
remaining stories after acknowledgement or burst grouping has failed
is not required to reject the queue.

## Governance

This constitution supersedes informal practice, plan files, and
README conventions wherever they conflict. Amendments MUST be made
through `/speckit-constitution`, MUST bump `CONSTITUTION_VERSION`
using semantic versioning, and MUST include a Sync Impact Report.

Versioning policy:

- MAJOR: a principle is removed or redefined incompatibly, or a
  previously forbidden practice becomes required.
- MINOR: a principle or section is added or materially expanded.
- PATCH: clarifications, wording, and non-semantic refinements.

Compliance review:

- Every pull request that changes runtime behavior MUST be reviewable
  against these principles. Reviewers MUST reject work that clones
  production scope, dual-writes incorrectly, or introduces
  non-idempotent channel side effects without a recorded waiver.
- Waivers are temporary, MUST name the principle, MUST state expiry
  or a follow-up spec, and MUST NOT silently rewrite go / no-go rules.
- Dependent Spec Kit templates and commands read this file at
  runtime; they are not edited as part of a constitution change.

**Version**: 1.0.0 | **Ratified**: 2026-09-14 | **Last Amended**: 2026-09-14
