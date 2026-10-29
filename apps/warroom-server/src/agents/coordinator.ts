import { defineExtension } from "@earendil-works/pi-durable";
import type { AgentDeps } from "./index.ts";

/**
 * Builds the Coordinator extension from the shared dependencies.
 * Context: the `coordinator` feature owns this function's content; its name and the `AgentDeps` argument are fixed.
 */
export function createCoordinatorExtension(_deps: AgentDeps) {
  // TODO(coordinator): this stub holds the Coordinator's tools, sections and model choice once that feature lands.
  return defineExtension({ name: "warroom.coordinator" });
}
