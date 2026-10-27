# HTTP shapes that warroom-server consumes from the sandbox live in packages/contracts

- **origin**: feature card-auth-sandbox
- **scope**: card-auth-sandbox, warroom-server
- **paths**: packages/contracts/**, apps/card-auth-sandbox/src/server.ts, apps/warroom-server/**
- **date**: 2026-10-27

## Decision

Define every HTTP response shape that warroom-server (or another app) reads from card-auth-sandbox as TypeBox schemas and types in `packages/contracts`, and export them from its index. The sandbox may import them as types only. warroom-server tools import them from `@warroom/contracts`, never from `apps/card-auth-sandbox`.

## Why

Importing across apps would make warroom-server depend on the sandbox's code. The contracts package is the one place server, browser, sandbox, tests, and smoke already share.

## Not decided here

Whether the sandbox's write endpoints (US-09) follow the same rule.
