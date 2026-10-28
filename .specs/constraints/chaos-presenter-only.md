# Chaos faults change only through the sandbox's loopback control listener, driven by npm run chaos

- **origin**: feature chaos-cascade-decoy
- **scope**: card-auth-sandbox, warroom-server, web
- **paths**: apps/card-auth-sandbox/src/chaos*.ts, apps/card-auth-sandbox/src/server.ts, apps/warroom-server/**, apps/web/**, packages/contracts/**
- **date**: 2026-10-27

## Decision

Chaos faults change only through the sandbox's control listener, which binds `127.0.0.1` and exists only when `CHAOS_PORT` is set, and only the presenter command `npm run chaos` drives it. No war room server code, contract, durable document, agent tool, or UI reads or changes chaos state. Later scenarios (US-11, US-15) add values to the same union and command.

## Why

The team decided on 2026-10-27 (D-08) that the war room finds the fault from its symptoms. warroom-server and the investigators can reach the sandbox's public port, so a chaos route there, or a chaos field in the war room, would stage the investigation.

## Trade-offs

The presenter needs a terminal next to the browsers, and the control listener has no authentication because loopback is its access control.

## Not decided here

Whether faults can combine (US-15), and how the presenter command reports several active scenarios.
