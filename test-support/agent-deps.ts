import type { AgentDeps } from "../apps/warroom-server/src/agents/index.ts";
import { resolveModels } from "../apps/warroom-server/src/models.ts";

/** Dependencies for tests that build a registry without a server: no database pool, an unreachable sandbox. */
export function testAgentDeps(): AgentDeps {
  return { sandboxUrl: "http://127.0.0.1:1", agentModels: resolveModels({}).agentModels };
}
