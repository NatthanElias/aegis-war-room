import { defineExtension } from "@earendil-works/pi-durable";
import type { AgentDeps } from "./index.ts";
import { InvestigationTask } from "./investigation-task.ts";

/**
 * Builds the investigators extension from the shared dependencies.
 * Context: the `investigators` feature owns this function's content; its name and the `AgentDeps` argument are fixed.
 */
export function createInvestigatorsExtension(_deps: AgentDeps) {
  // TODO(investigators): this stub provides only the finish-at-once task; the real investigator tools and task body replace it.
  return defineExtension({
    name: "warroom.investigators",
    tasks: [InvestigationTask],
  });
}
