import { defineExtension } from "@earendil-works/pi-durable";
import { InvestigationTask } from "./investigation-task.ts";

// TODO(investigators): this stub provides only the finish-at-once task; the real investigator tools and task body replace it.
export const InvestigatorsExtension = defineExtension({
  name: "warroom.investigators",
  tasks: [InvestigationTask],
});
