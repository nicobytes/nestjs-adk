# nestjs-adk

POC: NestJS in-process `Runner` from `@google/adk`. Gemini via `GOOGLE_API_KEY`. Agents live in `src/agents/`. The default id is `amaru`. `sequential_flow` is a manual router-then-worker combo. `routing` routes through `Workflow` graphs.

```bash
pnpm i
pnpm test
pnpm start
```

```bash
curl -s localhost:3000/inbound -H 'content-type: application/json' \
  -d '{"sessionId":"11111111-1111-1111-1111-111111111111","text":"di solo hola"}'

curl -s localhost:3000/inbound -H 'content-type: application/json' \
  -d '{"sessionId":"11111111-1111-1111-1111-111111111111","text":"pregúntame A o B con la tool"}'

curl -s localhost:3000/inbound/interactive -H 'content-type: application/json' \
  -d '{"sessionId":"11111111-1111-1111-1111-111111111111","buttonId":"b"}'

curl -s localhost:3000/operator/reply -H 'content-type: application/json' \
  -d '{"sessionId":"11111111-1111-1111-1111-111111111111","text":"humano"}'

curl -s localhost:3000/inbound -H 'content-type: application/json' \
  -d '{"sessionId":"22222222-2222-2222-2222-222222222222","agentId":"sequential_flow","text":"Find me the best sushi in Palo Alto and then tell me how to get there from the Caltrain station."}'

curl -s localhost:3000/inbound -H 'content-type: application/json' \
  -d '{"sessionId":"33333333-3333-3333-3333-333333333333","agentId":"routing","text":"Are there any cool outdoor concerts this weekend?"}'
```

Playground is another channel on the same Nest `Runner`, not `npx adk web`. Start Nest and open `http://localhost:3000/dev-ui/`. That is the official ADK chat UI, served as static files, talking to this process. WhatsApp is a sibling adapter on the same `ChannelService`: inbound webhooks call `inbound` / `resume`, and `ask_choice` still just calls `sendButtons`. A click must arrive as `functionResponse` (or as a button id that matches the last buttons message); the core still resumes with a function response.

Point Meta at `GET/POST /whatsapp/webhook`. Outbound Graph calls need `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`. Set `WHATSAPP_APP_SECRET` so Meta signatures are checked.

```bash
curl -s localhost:3000/apps/amaru/users/u_123/sessions/s_123 -X POST -H 'content-type: application/json' -d '{}'

curl -s localhost:3000/run -H 'content-type: application/json' \
  -d '{"appName":"amaru","userId":"u_123","sessionId":"s_123","newMessage":{"role":"user","parts":[{"text":"pregúntame A o B"}]}}'

curl -s localhost:3000/apps/sequential_flow/users/u_123/sessions/s_flow -X POST -H 'content-type: application/json' -d '{}'

curl -s localhost:3000/apps/routing/users/u_123/sessions/s_route -X POST -H 'content-type: application/json' -d '{}'

curl -s localhost:3000/run -H 'content-type: application/json' \
  -d '{"appName":"routing","userId":"u_123","sessionId":"s_route","newMessage":{"role":"user","parts":[{"text":"What are some fun things I can do today?"}]}}'
```

Live Gemini tests skip unless `GOOGLE_API_KEY` is set. Go/no-go is in `RESULTS.md`.
