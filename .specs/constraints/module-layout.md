# Code lives in four npm workspaces; no new top-level apps

- **origin**: feature walking-skeleton
- **scope**: layout
- **paths**: apps/**, packages/**, package.json
- **date**: 2026-10-27

## Decision

Code lives in the npm workspaces `apps/warroom-server`, `apps/card-auth-sandbox`, `apps/web`, and `packages/contracts`. `packages/contracts` holds the Chord contracts and the seeded-user types that server and browser share. Later features add folders under these; they never add a new top-level app without a plan.

## Why

One package would make the browser bundle pull in `pg` and pi-durable. Keeping contracts in their own package lets server, browser, tests, and the smoke script share one definition.

## Trade-offs

Test helpers shared by several apps sit in the repository-root `test-support/` folder, which is not a workspace.

## Not decided here

Where later features put new remote Chord types beyond `packages/contracts`.
