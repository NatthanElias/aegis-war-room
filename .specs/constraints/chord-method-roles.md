# Browsers reach the server through Chord acceptWebSockets with a server-resolved principal, and every mutating method asserts its caller's role

- **origin**: feature warroom-state
- **scope**: websocket, auth, warroom-server, web
- **paths**: apps/warroom-server/**, apps/web/**, packages/contracts/**
- **date**: 2026-10-27
- **replaces**: chord-websocket-principal

## Decision

Serve browsers with Chord `acceptWebSockets(wss, host, { principal })` from the `@earendil-works/chord` root, where `wss` is a `ws` `WebSocketServer({ noServer: true })` that the HTTP server hands `/chord` upgrades to. The principal `{ id, role }` is resolved on the server from the `user` query parameter; any other value refuses the socket. Never take identity from a client message or method argument.

Every Chord method that changes state asserts the caller's role itself, from the principal its factory received, and throws `forbidden()` when the role table in `docs/architecture-reference.md` does not allow it. A factory refuses the server's own principal when it serves browsers. Variants and hidden browser controls are presentation only and never count as authorization.

## Why

A separate WebSocket port would add a second published port and origin. `docs/architecture-reference.md` requires `makerId` and `checkerId` to come from the authenticated Chord principal, so identity cannot depend on client input. All seeded users get the same variant, so a client that skips its hidden controls reaches the method directly, and only a check inside the method stops it. Per-role variants would give a Responder `not_in_variant` instead of `forbidden` and would split again for each later method that Responders may call.

## Trade-offs

The `user` query parameter is a demo stand-in for authentication (real authentication is a Won't, D-07); anyone who can reach the port can pick a user. Each new mutating method repeats a role check.

## Not decided here

Roles for the Coordinator and other agents (US-07), and how real authentication replaces the `user` query parameter.
