import { createRegistry, type Extension, type Registry } from "@earendil-works/pi-durable";
import { CoordinatorExtension } from "./coordinator.ts";
import { InvestigatorsExtension } from "./investigators.ts";

export { INVESTIGATION_TASK, launchInvestigation } from "./investigation-task.ts";

/**
 * The one place agents are registered: the Coordinator, then the investigators.
 * `options.investigators` replaces the stub investigators, which tests use to inject a fake.
 */
export function createAgentRegistry(options: { investigators?: Extension } = {}): Registry {
  const registry = createRegistry();
  registry.install(CoordinatorExtension);
  registry.install(options.investigators ?? InvestigatorsExtension);
  return registry;
}
