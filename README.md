# nestjs-adk

POC: NestJS in-process `Runner` from `@google/adk`, with a **durable BullMQ decision path** for go/no-go evidence.

## Decision path (go/no-go)

Requires **Redis** (`REDIS_URL`, default `redis://127.0.0.1:6379`). Queue name: `nestjs-adk-messages` (do not share a queue named `messages` with other apps on the same Redis).

```bash
# example
docker run --rm -p 6379:6379 redis:7
pnpm i
pnpm test
pnpm start
```

```bash
curl -s localhost:3000/inbound -H 'content-type: application/json' \
  -d '{"waId":"5215512345678","text":"hola"}'
# → { "conversationId": "<uuid>", "status": "BOT_AUTO", "accepted": true }

curl -s localhost:3000/inbound/interactive -H 'content-type: application/json' \
  -d '{"conversationId":"<uuid>","buttonId":"b"}'

curl -s localhost:3000/conversations/<uuid>/handoff -X POST
curl -s localhost:3000/operator/reply -H 'content-type: application/json' \
  -d '{"conversationId":"<uuid>","text":"el precio es 100"}'
curl -s localhost:3000/health
```

Verdict table: **[RESULTS.md](./RESULTS.md)**. Spec/plan/tasks: `specs/001-durable-queue-poc/`.
Python-port parity (Amaru-lite brain) ≠ queue; see **[RESULTS-port-python.md](./RESULTS-port-python.md)** (`agentId: amaru_lite`).

Live Gemini tests skip unless `GOOGLE_API_KEY` is set. `/whatsapp/*` and playground are **not** the decision path.

## Legacy / demo paths

```bash
curl -s localhost:3000/inbound -H 'content-type: application/json' \
  -d '{"sessionId":"11111111-1111-1111-1111-111111111111","text":"di solo hola"}'

curl -s localhost:3000/inbound/interactive -H 'content-type: application/json' \
  -d '{"sessionId":"11111111-1111-1111-1111-111111111111","buttonId":"b"}'

curl -s localhost:3000/operator/reply -H 'content-type: application/json' \
  -d '{"sessionId":"11111111-1111-1111-1111-111111111111","text":"humano"}'
```

Playground: `http://localhost:3000/dev-ui/`. WhatsApp Graph needs `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_APP_SECRET`.
