# Browsers reach the server through Chord acceptWebSockets with a server-resolved principal

- **origin**: feature walking-skeleton
- **scope**: websocket, auth, warroom-server, web
- **paths**: apps/warroom-server/**, apps/web/**, packages/contracts/**
- **date**: 2026-10-27

## Decision

Serve browsers with Chord `acceptWebSockets(wss, host, { principal })` from the `@earendil-works/chord` root, where `wss` is a `ws` `WebSocketServer({ noServer: true })` that the HTTP server hands `/chord` upgrades to. The principal `{ id, role }` is resolved on the server from the `user` query parameter; any other value refuses the socket. Never take identity from a client message or method argument.

## Why

A separate WebSocket port would add a second published port and origin. `docs/architecture-reference.md` requires `makerId` and `checkerId` to come from the authenticated Chord principal, so identity cannot depend on client input.

## Trade-offs

The `user` query parameter is a demo stand-in for authentication (real authentication is a Won't, D-07); anyone who can reach the port can pick a user.

## Not decided here

Role-based permissions on methods (US-04).
