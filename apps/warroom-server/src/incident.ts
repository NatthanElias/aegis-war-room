import { forbidden, type Host, invalid, local } from "@earendil-works/chord";
import type { DocumentWatch } from "@earendil-works/pi-durable";
import {
  Incident,
  PHASE_TRANSITIONS,
  PhaseSchema,
  type Principal,
  RosterSchema,
  SeveritySchema,
} from "@warroom/contracts";
import { Type } from "typebox";
import type { IncidentDoc, IncidentStore } from "./incident-store.ts";

/**
 * The committed `app.warroom` value as Chord state, one cell per field.
 * Context: it lives for the whole host lifetime and is written only by the watch in `serveIncidentMirror`,
 * so a value is visible here only after its SQLite commit.
 */
export const IncidentMirror = local("warroom.incident-mirror", {
  version: 1,
  input: Type.Object({}),
  members: { sev: SeveritySchema, phase: PhaseSchema, roster: RosterSchema },
});

/**
 * Mirrors every committed revision of `app.warroom` into `warroom.incident-mirror`.
 * `watch` must be taken before the host serves, so its first value is the cells' initial value and no commit
 * falls between the two.
 */
export function serveIncidentMirror(
  host: Host<Principal>,
  watch: DocumentWatch<IncidentDoc>,
): void {
  host.serve(
    IncidentMirror,
    (_input, _principal, self) => {
      const initial = watch.value;
      if (initial === null) throw new Error("app.warroom was retired before the mirror started");
      const sev = self.state("sev", SeveritySchema, initial.sev);
      const phase = self.state("phase", PhaseSchema, initial.phase);
      const roster = self.state("roster", RosterSchema, initial.roster);
      self.task(async (ctx) => {
        watch.start(async (value) => {
          if (value === null || ctx.signal.aborted) return;
          if (value.sev !== sev.value) sev.replace(ctx, value.sev);
          if (value.phase !== phase.value) phase.replace(ctx, value.phase);
          if (JSON.stringify(value.roster) !== JSON.stringify(roster.value)) {
            roster.replace(ctx, value.roster);
          }
        });
        if (!ctx.signal.aborted) {
          await new Promise<void>((resolve) => {
            ctx.signal.addEventListener("abort", () => resolve(), { once: true });
          });
        }
        await watch.stop();
      });
      return { sev, phase, roster };
    },
    { lifetime: "host" },
  );
}

/**
 * Serves `warroom.incident` v1 to browsers. State comes from the mirror; every change goes through
 * `store.commitIncident`.
 * Hazard: each method asserts the caller's role itself, because the factory serves every seeded user the same
 * variant and hiding a control in the browser is not authorization.
 */
export function serveIncident(host: Host<Principal>, store: IncidentStore): void {
  host.serve(Incident, (_input, principal, self) => {
    if (principal.role === "Server") throw forbidden();
    const mirror = self.get(IncidentMirror, {});
    return {
      variant: "default",
      sev: mirror.sev,
      phase: mirror.phase,
      roster: mirror.roster,
      setPhase: async ({ phase }) => {
        if (principal.role !== "IC") throw forbidden();
        // Why: the transition check reads the document inside the serialized commit, so two concurrent identical
        // moves cannot both pass it against the same current phase.
        await store.commitIncident((doc) => {
          if (!PHASE_TRANSITIONS[doc.phase].includes(phase)) {
            throw invalid("transition", `cannot move the phase from ${doc.phase} to ${phase}`);
          }
          doc.phase = phase;
        });
      },
      setSev: async ({ sev }) => {
        if (principal.role !== "IC") throw forbidden();
        await store.commitIncident((doc) => {
          if (doc.sev !== sev) doc.sev = sev;
        });
      },
    };
  });
}
