import { describe, expect, test } from "vitest";
import { AGENT_MODEL_ENV, resolveModels } from "../src/models.ts";

const haiku = { provider: "openrouter", modelId: "anthropic/claude-haiku-5.5" };
const sonnet = { provider: "openrouter", modelId: "anthropic/claude-sonnet-5.5" };

function failure(env: Record<string, string>): string {
  try {
    resolveModels(env);
  } catch (error) {
    return String(error);
  }
  throw new Error("resolveModels accepted an environment that must be rejected");
}

describe("per-agent models", () => {
  test("resolves per-agent models", () => {
    expect(AGENT_MODEL_ENV).toEqual({
      coordinator: "WARROOM_MODEL_COORDINATOR",
      logs: "WARROOM_MODEL_LOGS",
      db: "WARROOM_MODEL_DB",
      deploy: "WARROOM_MODEL_DEPLOY",
      acquirer: "WARROOM_MODEL_ACQUIRER",
    });

    const defaults = resolveModels({});
    const dbOnly = resolveModels({ WARROOM_MODEL_DB: "anthropic/claude-sonnet-5.5" });
    const message = failure({ WARROOM_MODEL_LOGS: "anthropic/claude-nope" });

    expect(defaults.agentModels).toEqual({
      coordinator: haiku,
      logs: haiku,
      db: haiku,
      deploy: haiku,
      acquirer: haiku,
    });
    expect(defaults.ready).toBe(false);
    expect(dbOnly.agentModels).toEqual({
      coordinator: haiku,
      logs: haiku,
      db: sonnet,
      deploy: haiku,
      acquirer: haiku,
    });
    expect(message).toContain("anthropic/claude-nope");
    expect(message).toContain("WARROOM_MODEL_LOGS");
    expect(resolveModels({ OPENROUTER_API_KEY: "x" }).ready).toBe(true);
  });

  test("an empty variable means the default", () => {
    // Context: compose passes every variable even when `.env` leaves it empty.
    const setup = resolveModels({ WARROOM_MODEL_COORDINATOR: "", WARROOM_MODEL_DB: "  " });

    expect(setup.agentModels.coordinator).toEqual(haiku);
    expect(setup.agentModels.db).toEqual(haiku);
  });

  test("the provider reads the key from the given environment", async () => {
    // Why: the key must come from the environment handed to `resolveModels`, never from whatever process runs the test.
    const withKey = await resolveModels({ OPENROUTER_API_KEY: "x" }).models.checkAuth("openrouter");
    const withoutKey = await resolveModels({}).models.checkAuth("openrouter");

    expect(withKey?.type).toBe("api_key");
    expect(withoutKey).toBeUndefined();
  });
});
