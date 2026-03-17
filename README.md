# Indian Stock Research Service

A Node.js TypeScript service that bridges a REST API to Prysm's streaming chat endpoint for Indian stock research. It uses Playwright for Bearer token capture from `prysm.fi` and BullMQ for managed concurrency.

## Features

- **SSE Stream Parsing**: Reconstructs the final answer by concatenating Prysm `output/text` chunks.
- **Token Management**: Intercepts and caches auth tokens from a persistent browser session.
- **Concurrency Control**: Uses BullMQ (Redis) to handle multiple requests smoothly.
- **Typed Config**: Secure environment variable handling.
- **Structured Logging**: JSON logs via Winston.

## Prerequisites

- Node.js 18+
- Docker (for Redis)
- Google Chrome installed locally

## Setup

1. **Clone and Install**:
   ```bash
   npm install
   ```

2. **Configure**:
   Copy `.env.example` to `.env` and fill in:
   - `API_KEY`: A secret key to protect your endpoint.
   - `HEADLESS=false` for the first manual login, then switch it back to `true` after the browser profile is saved.
   - Keep `CHROMIUM_SANDBOX=true` on a normal local Linux desktop. Only set it to `false` if Chrome fails to launch in a container/VM environment that cannot support the sandbox.

3. **Start Redis**:
   ```bash
   docker compose up -d redis
   ```

   If you run `npm run dev` on your host machine, keep `REDIS_URL=redis://localhost:6379`.
   The `redis://redis:6379` hostname is only valid for the app container inside Docker Compose.

4. **First Login (Important)**:
   Set `HEADLESS=false` in `.env` and run:
   ```bash
   npm run dev
   ```
  A Chrome window will open. Log in to Prysm manually. If you use Google sign-in, this must be the regular Chrome channel, not Playwright's bundled test browser. Once you see the "Captured fresh Bearer token" log, you can stop the service and set `HEADLESS=true`.

Each incoming question creates a fresh Prysm request automatically. Clients do not manage Prysm tokens, but they can control the request shape with `chat_model`, `response_length`, optional `thinking_level`, and optional `chat_uuid`.

## API Usage

### Health Check
```bash
curl http://localhost:3000/research/health
```

### Ask a Question
```bash
curl -X POST http://localhost:3000/research/ask \
  -H "x-api-key: your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{"question":"Screen for oil stocks with improving margins amid rising crude prices.","chat_model":"strategic","response_length":"short","thinking_level":"fast"}'
```

Returns:
```json
{
  "answer": "..."
}
```

Validation rules:
- `chat_model`: `strategic` or `analytical`
- `response_length`: `short`, `medium`, or `long`
- `thinking_level`: `fast`, `balanced`, or `deep`, and only allowed when `chat_model` is `strategic`
- `chat_uuid`: optional non-empty string

## Architecture

1. **Client** sends POST request.
2. **Express** validates key and enqueues a job.
3. **Worker** picks up job, gets token from **TokenManager**.
4. **Service** calls Prysm's streaming endpoint using the request's model/length options.
5. **SSE Parser** concatenates `section="output"` and `type="text"` chunks into a final answer.
6. **Controller** returns the result to the client.
