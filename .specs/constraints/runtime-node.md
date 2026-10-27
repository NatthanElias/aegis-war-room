# Services are Node.js 24 running erasable .ts files directly

- **origin**: feature walking-skeleton
- **scope**: runtime, build
- **paths**: apps/**, packages/**, scripts/**, Dockerfile, docker-compose.yml, tsconfig.json
- **date**: 2026-10-27

## Decision

Run every service and script on Node.js 24 (`node:24-alpine` in containers, `engines.node >=22.19`) by executing `.ts` files directly through type stripping. Write erasable-only TypeScript: no enums, namespaces, or parameter properties, and import with the `.ts` extension. Vitest runs the tests and npm installs the dependencies.

## Why

A `tsc` build step before every run would be one more artifact to keep in sync for no runtime gain. `tsconfig.json` enforces the rule with `erasableSyntaxOnly` and `allowImportingTsExtensions`.

## Trade-offs

The browser bundle is the only built artifact (`vite build`); its code may use any syntax Vite accepts, but must still pass `tsc --noEmit`.

## Not decided here

Which Node patch version the images pin.
