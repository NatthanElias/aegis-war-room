# War room

Proof-of-concept incident war room for a credit-card payment pipeline. Design: `docs/architecture.md`. Schemas and contracts: `docs/architecture-reference.md`.

## Start the stack

```bash
docker compose up --wait --build   # PostgreSQL, migrate, card-auth-sandbox, warroom-server
npm run smoke                      # probes the running stack; runs no Docker command
docker compose down
```

Smoke reads sandbox health through warroom-server because the sandbox has no published port. Set `SMOKE_SANDBOX_URL` to probe it directly; smoke also respects `WARROOM_PORT`.

The sandbox authorizes synthetic Visa and Mastercard traffic by itself (`TRAFFIC_RATE: "5"` in compose; unset or `0` generates none). Its read-only telemetry has no published port, so read it inside the container:

```bash
docker compose exec -T card-auth-sandbox wget -qO- http://127.0.0.1:4000/telemetry/acquirers   # approvals and latency per acquirer
docker compose exec -T card-auth-sandbox wget -qO- http://127.0.0.1:4000/telemetry/pool         # app pool counters
```

`/telemetry/authorizations` also takes `since` and `until` (ISO 8601, at most 3600 s apart). Routes and shapes: `docs/architecture-reference.md`.

Open `http://localhost:8080/?user=alice` (or `bob`, `carol`). Change the host port with `WARROOM_PORT`.

## Develop

Node.js 22.19 or newer runs the `.ts` files directly, so `npm install` is the only setup.

```bash
npm install
npm test             # Vitest; needs the test PostgreSQL below
npm run typecheck    # tsc --noEmit
npm run lint         # biome check .   (npm run format fixes it)
```

The database tests use their own PostgreSQL on `127.0.0.1:55432` and fail, never skip, when it is down:

```bash
docker run -d --name warroom-test-pg --restart unless-stopped -p 127.0.0.1:55432:5432 \
  -e POSTGRES_PASSWORD=warroom postgres:17-alpine   # later runs: docker start warroom-test-pg
```

Set `TEST_DATABASE_URL` to use another server (default `postgres://postgres:warroom@127.0.0.1:55432/postgres`).

## Layout

| Folder | Holds |
| --- | --- |
| `apps/warroom-server` | Chord WebSocket host, pi-durable incident file, static web bundle |
| `apps/card-auth-sandbox` | Payment sandbox service (BIN routing, acquirers, traffic, telemetry), SQL migrations, `migrate` |
| `apps/web` | React shell built by Vite |
| `packages/contracts` | Chord contracts, seeded users, and sandbox telemetry schemas |
| `scripts/smoke.ts` | Smoke probes for a running stack |
