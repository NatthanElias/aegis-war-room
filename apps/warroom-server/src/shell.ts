import { forbidden, type Host } from "@earendil-works/chord";
import { type Principal, Shell, ShellUserSchema } from "@warroom/contracts";
import { Runtime } from "./runtime.ts";

/**
 * Serves `warroom.shell` v1 to browsers. The user comes from the authenticated Chord principal only.
 * Hazard: the factory refuses the server's own principal so internal code cannot appear as a user.
 */
export function serveShell(host: Host<Principal>): void {
  host.serve(Shell, (_input, principal, self) => {
    if (principal.role === "Server") throw forbidden();
    const runtime = self.get(Runtime, {});
    const user = self.state("user", ShellUserSchema, { id: principal.id, role: principal.role });
    return {
      variant: "default",
      incidentId: runtime.incidentId,
      conversationId: runtime.conversationId,
      sandbox: runtime.sandbox,
      user,
    };
  });
}
