# Quickstart: Validate Durable Queue Proof

**Feature**: `001-durable-queue-poc`  
**Contracts**: [contracts/inbound-api.md](./contracts/inbound-api.md)  
**Data model**: [data-model.md](./data-model.md)

This guide is how a reviewer re-runs the go/no-go evidence after implementation. It is not the implementation itself.

## Prerequisites

- Node.js + **pnpm**
- **Redis** on `localhost:6379` (or set connection env documented in README)
- Optional: `GOOGLE_API_KEY` for live Gemini cases (B, E, H, I buttons). Without it, those tests skip; location/media inbox mapping can still run with channel stubs.

```bash
# Example Redis (document exact command in README when implementing)
docker run --rm -p 6379:6379 redis:7
```

If Redis cannot be started within ~1 hour of effort: stop, mark queue items blocked in `RESULTS.md`. Do not fake the queue with timers.

## Setup

```bash
pnpm i
# Ensure SESSION_DB_URL / POC sqlite paths are writable under ./data/
pnpm test
```

Decision path is `/inbound` + Bull + sqlite stub — **not** `/whatsapp/*` or playground.

## Manual smoke (after implementation)

```bash
pnpm start
```

```bash
# Ack should return conversationId quickly
curl -s localhost:3000/inbound -H 'content-type: application/json' \
  -d '{"waId":"5215512345678","text":"hola"}'

# Burst: three texts inside ~400ms → one agent turn (assert via tests / debug)
# Interactive click uses conversationId from ack
curl -s localhost:3000/inbound/interactive -H 'content-type: application/json' \
  -d '{"conversationId":"<uuid>","buttonId":"b"}'

curl -s localhost:3000/conversations/<uuid>/handoff -X POST
curl -s localhost:3000/operator/reply -H 'content-type: application/json' \
  -d '{"conversationId":"<uuid>","text":"el precio es 100"}'
curl -s localhost:3000/conversations/<uuid>/release -X POST
curl -s localhost:3000/conversations/<uuid>/close -X POST
curl -s localhost:3000/health
```

## Automated evidence (fixed test names)

Run the suite that includes these cases (exact file layout decided at implement time):

1. `returns http before the runner finishes` — A1  
2. `retries a failed job and then runs the agent` — A2  
3. `runs a delayed job after nest restart` — A3  
4. `batches three inbound texts into one runAsync` — A4  
5. `follow-up job drains texts that arrived while the worker was busy` — A4  
6. `serves another conversation while runAsync is in flight` — A5  
7. `pauses on ask_choice in a queue job and resumes with functionResponse` — B  
8. `resumes a paused choice after nest restart` — B  
9. `uses conversation uuid as adk session id` — C  
10. `skips the runner when conversation is WAITING_HUMAN` — D  
11. `operator reply is visible to the next agent turn` — E  
12. `crm messages and adk session are dual-write not prompt injection` — F  
13. `ask_choice sendButtons is idempotent across job retry` — G  
14. `does not send extra text when ask_choice pauses` — H  
15–20. Session gist / CRM payload / choice / location / inbox-without-session (I)

Also cover clarifications:

- Click scheduled while turn active waits for that turn (not parallel, not dropped)
- Already-scheduled turn still runs after handoff; new inbound after handoff does not
- Stray click (no pending choice) → inbox only
- Ack includes `conversationId`

```bash
pnpm test
# Live Gemini subset (when key present)
GOOGLE_API_KEY=... pnpm test
```

## Decision record

After experiments (or early stop on A1/A4 fail), fill **RESULTS.md** with every User Story 10 question, evidence pointers (test names), and overall go / no-go / yes-with-conditions.

## Expected outcomes for a theoretical go

- A1–A4, B, C, D, G, I pass  
- A5 pass **or** RESULTS notes separate worker required (not built here)  
- E and F pass **or** documented `appendEvent` workaround that is not inbox→prompt  
- Specialist-agent port remains **no / later**
