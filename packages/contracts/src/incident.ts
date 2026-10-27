import { hostNamed, method, remote } from "@earendil-works/chord";
import { type Static, Type } from "typebox";
import { ShellUserSchema } from "./shell.ts";

export const SeveritySchema = Type.Union([
  Type.Literal("SEV-1"),
  Type.Literal("SEV-2"),
  Type.Literal("SEV-3"),
]);

export const PhaseSchema = Type.Union([
  Type.Literal("DETECT"),
  Type.Literal("TRIAGE"),
  Type.Literal("MITIGATE"),
  Type.Literal("RESOLVE"),
  Type.Literal("POSTMORTEM"),
]);

export const RosterSchema = Type.Object({
  alice: ShellUserSchema,
  bob: ShellUserSchema,
  carol: ShellUserSchema,
});

export type Severity = Static<typeof SeveritySchema>;
export type Phase = Static<typeof PhaseSchema>;
export type Roster = Static<typeof RosterSchema>;

/** The three severities, most severe first. */
export const SEVERITIES: readonly Severity[] = ["SEV-1", "SEV-2", "SEV-3"];

/** The five phases in transition-table order. */
export const PHASES: readonly Phase[] = ["DETECT", "TRIAGE", "MITIGATE", "RESOLVE", "POSTMORTEM"];

/**
 * Allowed `setPhase` moves, from `docs/architecture-reference.md` "Phase transition table".
 * Context: the server enforces it inside the commit and the browser reads it to offer only legal moves.
 */
export const PHASE_TRANSITIONS: Readonly<Record<Phase, readonly Phase[]>> = {
  DETECT: ["TRIAGE"],
  TRIAGE: ["MITIGATE"],
  MITIGATE: ["RESOLVE", "TRIAGE"],
  RESOLVE: ["POSTMORTEM", "MITIGATE"],
  POSTMORTEM: [],
};

/** `warroom.incident` v1: the shared incident state and the two IC-only calls that change it. */
export const Incident = remote("warroom.incident", {
  version: 1,
  input: Type.Object({}),
  host: hostNamed("server"),
  variants: {
    default: {
      state: { sev: SeveritySchema, phase: PhaseSchema, roster: RosterSchema },
      methods: {
        setPhase: method(Type.Object({ phase: PhaseSchema })),
        setSev: method(Type.Object({ sev: SeveritySchema })),
      },
    },
  },
});

export interface IncidentState {
  readonly sev: Severity;
  readonly phase: Phase;
  readonly roster: Roster;
}
