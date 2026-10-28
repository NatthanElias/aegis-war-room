import { defineTask, type TaskId, type Tx } from "@earendil-works/pi-durable";
import {
  type InvestigationFinding,
  type InvestigationRequest,
  InvestigationRequestSchema,
} from "@warroom/contracts";
import Value from "typebox/value";

/** The one task through which the Coordinator hands work to an investigator. */
export const INVESTIGATION_TASK = "warroom.investigation";

/** The task definition version; a change needs both the Coordinator and the investigators to agree. */
export const INVESTIGATION_TASK_VERSION = 1;

/**
 * The stub investigation: finishes at once with an `inconclusive` finding that echoes the request.
 * Context: investigators replaces this body with real work; the name, version, input and result stay.
 */
export const InvestigationTask = defineTask<
  InvestigationRequest,
  { phase: "run" },
  InvestigationFinding
>({
  name: INVESTIGATION_TASK,
  version: INVESTIGATION_TASK_VERSION,
  initial: () => ({ phase: "run" }),
  phases: {
    run: async (task, runtime, context) => {
      const { hypothesisId, specialist } = task.input;
      await runtime.commit(
        () => ({
          status: "terminal",
          outcome: {
            status: "completed",
            result: {
              hypothesisId,
              specialist,
              verdict: "inconclusive",
              summary: "investigator not implemented",
              evidenceIds: [],
            },
          },
        }),
        context,
      );
    },
  },
  abort: (_task, runtime, context) =>
    runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), context),
});

/**
 * Creates a background `warroom.investigation` task inside the caller's commit and returns its task ID.
 * Throws `invalid_investigation_request` before anything is created when `request` fails the schema.
 * Context: the task is owned by the conversation that `tx` is bound to, so call it from `Conversation.commit`;
 * the Coordinator reads the outcome through pi-durable and never imports the investigators.
 */
export async function launchInvestigation(
  tx: Tx,
  request: InvestigationRequest,
): Promise<TaskId<InvestigationFinding>> {
  // Hazard: the request can come from model output, so the schema is checked here and not only by a tool.
  if (!Value.Check(InvestigationRequestSchema, request)) {
    const [first] = Value.Errors(InvestigationRequestSchema, request);
    throw new Error(
      `invalid_investigation_request: ${first?.instancePath ?? ""} ${first?.message ?? "does not match the schema"}`.trim(),
    );
  }
  return tx.createTask(InvestigationTask, request, {
    ownership: { kind: "conversation" },
    background: true,
  });
}
