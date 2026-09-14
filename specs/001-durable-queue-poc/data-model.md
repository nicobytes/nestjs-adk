# Data Model: Durable Queue Proof

**Feature**: `001-durable-queue-poc` | **Date**: 2026-09-14

Storage: lightweight SQLite file for product stub (recommended `./data/poc.sqlite`), separate from ADK `DatabaseSessionService` SQLite (`./data/sessions.sqlite`). Redis holds only the ephemeral text buffer lists and BullMQ job state.

## Entities

### Conversation

| Field | Type | Rules |
|-------|------|--------|
| `id` | UUID (PK) | Also used as ADK `sessionId` |
| `status` | enum | `BOT_AUTO` \| `WAITING_HUMAN` \| `HUMAN_ACTIVE` \| `CLOSED` |
| `wa_id` | string | Channel identity; not the session id |
| `updated_at` | datetime | Updated on inbound / status change |

**Uniqueness**: At most one **open** conversation (`status != CLOSED`) per `wa_id`. Find-or-create on inbound.

**Relationships**: Has many InboxMessage; 1:1 logical link to ADK session with `sessionId = id`.

### InboxMessage

| Field | Type | Rules |
|-------|------|--------|
| `id` | UUID (PK) | |
| `conversation_id` | UUID (FK) | |
| `role` | enum | `customer` \| `bot` \| `operator` |
| `kind` | enum | `text` \| `buttons` \| `list` \| `location` \| `media` \| `choice` |
| `body` | string | Inbox fallback text (prompt, caption, option title, etc.) |
| `payload_json` | JSON | Renderable details per kind (see mapping) |
| `source` | string (optional) | e.g. `ask_choice`, `inbound`, `operator` |
| `created_at` | datetime | |

**Not** the agent's prompt history. Operator UI reads this table only.

#### `payload_json` mapping

| Kind | `body` | `payload_json` |
|------|--------|----------------|
| `text` | message text | `{}` |
| `buttons` | prompt | `{ prompt, options: [{id,title}], functionCallId? }` — full options |
| `list` | prompt | `{ prompt, buttonLabel?, sections \| options }` |
| `location` | name or `"lat,lng"` | `{ latitude, longitude, name, address }` |
| `media` | caption or filename | `{ url, mimeType, caption }` |
| `choice` | option title if known else id | `{ buttonId }` |

### SentToolCall (idempotency)

| Field | Type | Rules |
|-------|------|--------|
| `id` | string (PK) | ADK `functionCallId` |
| `conversation_id` | UUID | |
| `tool_name` | string | e.g. `ask_choice` |
| `created_at` | datetime | |

Used so Bull retry does not call `sendButtons` twice for the same call.

### Inbound text buffer (Redis, not SQL)

- Key: `buffer:{conversationId}`
- Value: list of text payloads (JSON strings or raw text)
- Lifecycle: RPUSH on inbound text; drained+deleted atomically by processor; follow-up job if non-empty after run

### Agent memory event (ADK-owned)

Not modeled in POC tables. Owned by `DatabaseSessionService` / `session.events`.

Must include: user content, model content, small `ask_choice` args, short/null tool result, `functionResponse` with `buttonId`.

Must **not** include: channel interactive/Graph/Block Kit JSON.

### Outbound channel item (in-process + dual-write)

`ChannelService` remains the fake sink for assertions (`list`). Every send that the operator must see is also inserted as InboxMessage.

### Decision record

File artifact (`RESULTS.md`), not a DB entity. Table of architecture questions → result + evidence.

## State transitions — Conversation.status

```text
(new) --> BOT_AUTO
BOT_AUTO --handoff--> WAITING_HUMAN
WAITING_HUMAN --release--> BOT_AUTO
BOT_AUTO|WAITING_HUMAN|HUMAN_ACTIVE --close--> CLOSED
CLOSED --new inbound same wa_id--> (new) BOT_AUTO  # new id

HUMAN_ACTIVE: no dedicated transition action in this POC.
If status is already HUMAN_ACTIVE, inbound skip rules match WAITING_HUMAN.
```

## Validation rules

1. Open conversation lookup is by `wa_id` where `status != CLOSED`.
2. Agent session id always equals `conversations.id` on the decision path.
3. Text buffer never contains button clicks or handoff actions.
4. Click with pending choice → resume + inbox `choice`; click without pending → inbox `choice` only, no agent.
5. Operator reply always dual-writes: channel + inbox + ADK `appendEvent`.
6. Takeover does not cancel already-scheduled Bull jobs for that conversation.

## Volume assumptions

Demo scale: few conversations, short buffers, Redis local. No multi-tenant isolation in the stub.
