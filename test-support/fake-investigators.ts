import { defineExtension, defineTask } from "@earendil-works/pi-durable";
import {
  type InvestigationFinding,
  InvestigationFindingSchema,
  type InvestigationRequest,
} from "@warroom/contracts";
import Value from "typebox/value";
import {
  INVESTIGATION_TASK,
  INVESTIGATION_TASK_VERSION,
} from "../apps/warroom-server/src/agents/investigation-task.ts";

/**
 * A `warroom.investigators` extension whose `warroom.investigation` task returns what `script` says.
 * A scripted finding that fails the finding schema fails the task, so a fake cannot drift from the contract.
 */
export function fakeInvestigators(script: (request: InvestigationRequest) => InvestigationFinding) {
  const task = defineTask<InvestigationRequest, { phase: "run" }, InvestigationFinding>({
    name: INVESTIGATION_TASK,
    version: INVESTIGATION_TASK_VERSION,
    initial: () => ({ phase: "run" }),
    phases: {
      run: async (current, runtime, context) => {
        const finding = script(current.input);
        await runtime.commit(
          () =>
            Value.Check(InvestigationFindingSchema, finding)
              ? { status: "terminal", outcome: { status: "completed", result: finding } }
              : {
                  status: "terminal",
                  outcome: {
                    status: "failed",
                    error: {
                      message: "invalid_investigation_finding: the script broke the contract",
                    },
                  },
                },
          context,
        );
      },
    },
    abort: (_task, runtime, context) =>
      runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), context),
  });
  return defineExtension({ name: "warroom.investigators", tasks: [task] });
}
