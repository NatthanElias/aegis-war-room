import { createModels, type MutableModels } from "@earendil-works/pi-ai/models";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import type { ModelRef } from "@earendil-works/pi-durable";

/** The environment variable that sets each agent's model. */
export const AGENT_MODEL_ENV = {
  coordinator: "WARROOM_MODEL_COORDINATOR",
  logs: "WARROOM_MODEL_LOGS",
  db: "WARROOM_MODEL_DB",
  deploy: "WARROOM_MODEL_DEPLOY",
  acquirer: "WARROOM_MODEL_ACQUIRER",
} as const;

export type AgentName = keyof typeof AGENT_MODEL_ENV;
export type AgentModels = Record<AgentName, ModelRef>;

/** Context: the team's default for every agent until it picks final models (D-12). */
export const DEFAULT_MODEL_ID = "anthropic/claude-haiku-5.5";

const OPENROUTER_KEY_ENV = "OPENROUTER_API_KEY";

export interface ModelSetup {
  readonly models: MutableModels;
  readonly agentModels: AgentModels;
  /** False without `OPENROUTER_API_KEY`: the server runs, but a model call would fail. */
  readonly ready: boolean;
}

/**
 * Registers OpenRouter and reads each agent's model ID from `env`, an empty value meaning the default.
 * Throws `unknown model <id> (<variable>)` for an ID that OpenRouter's catalogue does not list.
 * Why: the provider reads `OPENROUTER_API_KEY` from this same `env`, and only when a model is called, so a
 * missing key never stops startup and a test's `env` never depends on the real process environment.
 */
export function resolveModels(env: Readonly<Record<string, string | undefined>>): ModelSetup {
  const models = createModels({
    authContext: { env: async (name) => env[name], fileExists: async () => false },
  });
  models.setProvider(openrouterProvider());
  const agentModels = {} as Record<AgentName, ModelRef>;
  for (const agent of Object.keys(AGENT_MODEL_ENV) as AgentName[]) {
    const variable = AGENT_MODEL_ENV[agent];
    const modelId = env[variable]?.trim() || DEFAULT_MODEL_ID;
    if (models.getModel("openrouter", modelId) === undefined) {
      throw new Error(`unknown model ${modelId} (${variable})`);
    }
    agentModels[agent] = { provider: "openrouter", modelId };
  }
  return { models, agentModels, ready: Boolean(env[OPENROUTER_KEY_ENV]) };
}
