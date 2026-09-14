# Contract: Decision-path HTTP API

**Feature**: `001-durable-queue-poc`  
**Base**: Nest HTTP (same process as today). Simulated channel only.  
**Auth**: None (POC).  
**Related**: [data-model.md](../data-model.md)

This contract covers the **decision path** only. Existing `/whatsapp/*`, playground `/dev-ui`, and `/run` remain demo paths and are not go/no-go evidence.

---

## POST /inbound

Accept customer text. Find-or-create open conversation. Buffer + schedule turn. Do **not** wait for the agent.

### Request

```json
{
  "waId": "5215512345678",
  "text": "hola",
  "agentId": "amaru"
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `waId` | yes | Channel identity |
| `text` | yes | Non-empty |
| `agentId` | no | Defaults to POC default agent |

### Response `200` (within 100ms when turn is slow)

```json
{
  "conversationId": "11111111-1111-1111-1111-111111111111",
  "status": "BOT_AUTO",
  "accepted": true
}
```

### Behavior by status at accept time

| Status | Persist customer message | Schedule agent turn |
|--------|--------------------------|---------------------|
| `BOT_AUTO` | yes | yes (text buffer + delayed job) |
| `WAITING_HUMAN` / `HUMAN_ACTIVE` | yes | **no** |
| `CLOSED` | N/A (create new conversation first) | yes on new open row |

### MUST NOT

- Await job finished / `runAsync` before responding
- Use `waId` as ADK session id

---

## POST /inbound/interactive

Accept a button click. Schedule immediately (`delay: 0`), separate from text buffer. If a turn for that conversation is active, run only after it finishes.

### Request

```json
{
  "conversationId": "11111111-1111-1111-1111-111111111111",
  "buttonId": "b"
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `conversationId` | yes | From prior `/inbound` ack |
| `buttonId` | yes | Option id |

### Response `200`

```json
{
  "conversationId": "11111111-1111-1111-1111-111111111111",
  "accepted": true
}
```

### When job runs

| Pending choice? | Effect |
|-----------------|--------|
| yes | Resume with `functionResponse` / option id; inbox `kind=choice` |
| no | Inbox `kind=choice` only; **no** agent turn; **no** invented customer text |

---

## POST /conversations/:id/handoff

### Response `200`

```json
{ "conversationId": "...", "status": "WAITING_HUMAN" }
```

Sets `WAITING_HUMAN` only. Does not cancel already-scheduled jobs.

---

## POST /conversations/:id/release

### Response `200`

```json
{ "conversationId": "...", "status": "BOT_AUTO" }
```

---

## POST /conversations/:id/close

### Response `200`

```json
{ "conversationId": "...", "status": "CLOSED" }
```

Next `/inbound` for the same `waId` creates a new conversation id / ADK session.

---

## POST /operator/reply

Send operator text to the channel, store inbox row, append to ADK session **without** `runAsync`.

### Request

```json
{
  "conversationId": "11111111-1111-1111-1111-111111111111",
  "text": "el precio es 100"
}
```

### Response `200`

```json
{
  "conversationId": "11111111-1111-1111-1111-111111111111",
  "accepted": true
}
```

### MUST

- `ChannelService.sendText`
- Insert inbox `role=operator`, `kind=text`
- `sessionService.appendEvent` (or equivalent) so the next agent turn can see the fact

### MUST NOT

- Call `runAsync` / generate a model reply at this moment

---

## GET /health

### Response `200`

```json
{ "ok": true }
```

Used by isolation test (A5) while another conversation’s turn is in flight.

---

## GET /conversations/:id/debug (optional)

Human inspection; not required for go.

```json
{
  "conversation": { "id": "...", "status": "BOT_AUTO", "waId": "..." },
  "messages": [ /* inbox rows */ ],
  "sessionEventCount": 12,
  "sessionPreview": [ /* short event summaries, not Graph payloads */ ]
}
```

Must not add production-only CRM columns.

---

## Error responses (minimal)

| Status | When |
|--------|------|
| `400` | Validation failure |
| `404` | Unknown `conversationId` |
| `409` | Optional: conflicting close/handoff (not required for go) |

---

## Compatibility note

Legacy `{ sessionId, text }` on `/inbound` is **not** the decision contract. Keep old shape only if needed for temporary backward compatibility with non-decision demos; go/no-go tests use `waId` + returned `conversationId`.
