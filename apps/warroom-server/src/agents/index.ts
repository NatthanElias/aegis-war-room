import { createRegistry, type Extension, type Registry } from "@earendil-works/pi-durable";
import type { Pool } from "pg";
import type { AgentModels } from "../models.ts";
import { createCoordinatorExtension } from "./coordinator.ts";
import { createInvestigatorsExtension } from "./investigators.ts";

export { INVESTIGATION_TASK, launchInvestigation } from "./investigation-task.ts";

/**
 * What every agent extension needs from the server, so no extension imports a module-level pool or model.
 * `diagPool` is absent when the server runs without a database, as in tests that need none.
 */
export interface AgentDeps {
  readonly diagPool?: Pool;
  readonly sandboxUrl: string;
  readonly agentModels: AgentModels;
}

/**
 * The one place agents are registered: the Coordinator, then the investigators.
 * `options.investigators` replaces the stub investigators, which tests use to inject a fake.
 */
export function createAgentRegistry(options: {
  deps: AgentDeps;
  investigators?: Extension;
}): Registry {
  const registry = createRegistry();
  registry.install(createCoordinatorExtension(options.deps));
  registry.install(options.investigators ?? createInvestigatorsExtension(options.deps));
  return registry;
}
