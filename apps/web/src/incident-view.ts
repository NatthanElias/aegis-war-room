import { isChordError } from "@earendil-works/chord";
import {
  type IncidentState,
  PHASE_TRANSITIONS,
  PHASES,
  type Phase,
  type Role,
  SEVERITIES,
  type SeededUserId,
  type Severity,
} from "@warroom/contracts";
import type { ShellScreen } from "./shell-view.ts";

/** What the shell knows about the incident besides the connection: the server's last state and the last call. */
export interface IncidentSnapshot {
  /** The latest `warroom.incident` state. Only the server changes it, never a rejected or pending call. */
  readonly incident?: IncidentState;
  /** True while a `setPhase` or `setSev` call is in flight. */
  readonly pending: boolean;
  /** The Chord error code of the last rejected call. */
  readonly error?: string;
}

export type IncidentEvent =
  | { readonly type: "state"; readonly state: IncidentState }
  | { readonly type: "call-started" }
  | { readonly type: "call-resolved" }
  | { readonly type: "call-rejected"; readonly code: string }
  | { readonly type: "connection-lost" };

export const initialIncident: IncidentSnapshot = { pending: false };

export function reduceIncident(snapshot: IncidentSnapshot, event: IncidentEvent): IncidentSnapshot {
  switch (event.type) {
    case "state":
      return { ...snapshot, incident: event.state };
    case "call-started":
      return { incident: snapshot.incident, pending: true };
    case "call-resolved":
      return { incident: snapshot.incident, pending: false };
    case "call-rejected":
      return { incident: snapshot.incident, pending: false, error: event.code };
    case "connection-lost":
      return initialIncident;
  }
}

/** The Chord error code of a rejected call, or `error` for anything else, such as a dropped socket. */
export function rejectionCode(error: unknown): string {
  return isChordError(error) ? error.code : "error";
}

const ROSTER_ORDER: readonly SeededUserId[] = ["alice", "bob", "carol"];

export interface IncidentControls {
  readonly severity: {
    readonly options: readonly Severity[];
    readonly value: Severity;
    readonly disabled: boolean;
  };
  /** One control per phase the transition table allows from the current phase. */
  readonly phases: readonly { readonly to: Phase; readonly disabled: boolean }[];
}

export type IncidentPanel =
  | { readonly kind: "hidden" }
  | {
      readonly kind: "live";
      readonly sev: Severity;
      readonly phases: readonly { readonly phase: Phase; readonly current: boolean }[];
      readonly roster: readonly { readonly id: SeededUserId; readonly role: Role }[];
      /** Null unless the user is the Incident Commander. Hiding is presentation; the server decides. */
      readonly controls: IncidentControls | null;
      readonly error: string | null;
    };

/** The panel is live only when the shell is connected and the incident state has arrived. */
export function incidentPanel(screen: ShellScreen, snapshot: IncidentSnapshot): IncidentPanel {
  const { incident } = snapshot;
  if (screen.kind !== "connected" || incident === undefined) return { kind: "hidden" };
  const commander = screen.state.user.role === "IC";
  return {
    kind: "live",
    sev: incident.sev,
    phases: PHASES.map((phase) => ({ phase, current: phase === incident.phase })),
    roster: ROSTER_ORDER.map((id) => ({ id, role: incident.roster[id].role })),
    controls: commander
      ? {
          severity: { options: SEVERITIES, value: incident.sev, disabled: snapshot.pending },
          phases: PHASE_TRANSITIONS[incident.phase].map((to) => ({
            to,
            disabled: snapshot.pending,
          })),
        }
      : null,
    error: snapshot.error ?? null,
  };
}
