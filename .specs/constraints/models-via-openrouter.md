# Agents call models through OpenRouter, with the model set by configuration

- **origin**: team D-12
- **scope**: warroom-server, models
- **paths**: apps/warroom-server/**
- **date**: 2026-10-28

## Decision

`warroom-server` reaches every chat model through pi-ai's `openrouterProvider()`, which reads `OPENROUTER_API_KEY`. The model ID comes from configuration (an environment variable), with `anthropic/claude-haiku-5.5` as the default for every agent until the team picks final models; code never hard-codes a model ID at a call site. Tests use pi-ai's faux provider and never call OpenRouter. Without a key, the server still starts and reports the Coordinator as offline instead of failing.

## Why

The team uses one OpenRouter account and wants to change models later without code changes (D-12).

## Trade-offs

Every model call depends on one provider and one key, already listed as a roadmap risk.

## Not decided here

The final model for each agent, and how the Jev classifier is reached.
