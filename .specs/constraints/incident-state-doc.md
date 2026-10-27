# Incident state lives in the app.warroom session document; Chord state only mirrors committed revisions

- **origin**: feature warroom-state
- **scope**: storage, warroom-server
- **paths**: apps/warroom-server/**, packages/contracts/src/incident.ts
- **date**: 2026-10-27

## Decision

Keep the incident's `sev`, `phase`, and `roster` in the pi-durable session document `app.warroom` (kind `app.warroom`, version 1). Write it only through `harness.commit`, and make every Chord state that shows it a mirror: one host-lifetime watch (`watchDoc`) replaces the Chord state from each committed revision. Never write Chord state first and commit afterwards. Later features add fields with a version bump and a `migrate` function.

## Why

Chord state lives in memory, but the incident must survive `kill -9`. Publishing from the committed revision means a browser never sees a phase that a crash then loses, and the commit line serializes concurrent writers.

## Trade-offs

A browser sees a change one watch delivery after the commit instead of at the write.

## Not decided here

Presence in the roster, and how agents write to the document (US-05, US-07).
