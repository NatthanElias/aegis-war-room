# Every screen meets a production-grade UI and UX bar

- **origin**: team D-10
- **scope**: web, ui
- **paths**: apps/web/**, apps/*/web/**
- **date**: 2026-10-28

## Decision

Every screen, in the war room and in the monitoring console, is built as a finished product: a consistent design system, clear hierarchy, responsive layout, and designed empty, loading, error, and unauthorized states. A screen never ships as a plain or demo-only panel. Each UI feature's plan states design criteria for its screens, and its review includes a visual check of each one.

## Why

The team judges the war room as a production-ready AI product at the 2026-12-03 defense, not as a proof-of-concept panel (D-10). UX, meaning flows, feedback, latency, and clarity, weighs as much as visual polish.

## Trade-offs

Each UI feature takes longer, which is why `warroom-ui` was split into two features (D-14).

## Not decided here

The visual identity itself, and whether the war room and the monitoring console share one design system or look like two vendors' products.
