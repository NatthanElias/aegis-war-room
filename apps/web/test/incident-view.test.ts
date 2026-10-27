import { forbidden, invalid } from "@earendil-works/chord";
import type { IncidentState, Phase, ShellState } from "@warroom/contracts";
import { describe, expect, test } from "vitest";
import {
  type IncidentEvent,
  type IncidentSnapshot,
  incidentPanel,
  initialIncident,
  reduceIncident,
  rejectionCode,
} from "../src/incident-view.ts";
import {
  type ConnectionEvent,
  initialConnection,
  reduceConnection,
  type ShellScreen,
  shellScreen,
} from "../src/shell-view.ts";

// Why: written out here on purpose, so a wrong order or table in production cannot make these tests agree with it.
const PHASE_ORDER: readonly Phase[] = ["DETECT", "TRIAGE", "MITIGATE", "RESOLVE", "POSTMORTEM"];
const COMMANDER_MOVES: Readonly<Record<Phase, readonly Phase[]>> = {
  DETECT: ["TRIAGE"],
  TRIAGE: ["MITIGATE"],
  MITIGATE: ["RESOLVE", "TRIAGE"],
  RESOLVE: ["POSTMORTEM", "MITIGATE"],
  POSTMORTEM: [],
};

const shellState = (
  id: "alice" | "bob" | "carol",
  role: ShellState["user"]["role"],
): ShellState => ({
  incidentId: "test-inc",
  conversationId: 7,
  user: { id, role },
  sandbox: "up",
});
const playConnection = (events: ConnectionEvent[]) =>
  events.reduce(reduceConnection, initialConnection);
const connected = (state: ShellState): ShellScreen =>
  shellScreen(playConnection([{ type: "state", state }]));
const aliceScreen = connected(shellState("alice", "IC"));

// Context: the roster keys are deliberately not in alice, bob, carol order, so the panel has to order them itself.
const incidentAt = (phase: Phase, sev: IncidentState["sev"] = "SEV-2"): IncidentState => ({
  sev,
  phase,
  roster: {
    carol: { id: "carol", role: "Observer" },
    alice: { id: "alice", role: "IC" },
    bob: { id: "bob", role: "Responder" },
  },
});

const play = (events: IncidentEvent[]): IncidentSnapshot =>
  events.reduce(reduceIncident, initialIncident);

describe("incident panel", () => {
  test("live panel shows severity phases and roster", () => {
    for (const phase of PHASE_ORDER) {
      const panel = incidentPanel(aliceScreen, play([{ type: "state", state: incidentAt(phase) }]));

      if (panel.kind !== "live") throw new Error(`panel is ${panel.kind} at ${phase}`);
      expect(panel.sev).toBe("SEV-2");
      expect(panel.phases.map((p) => p.phase)).toEqual(PHASE_ORDER);
      expect(panel.phases.filter((p) => p.current)).toEqual([{ phase, current: true }]);
      expect(panel.roster).toEqual([
        { id: "alice", role: "IC" },
        { id: "bob", role: "Responder" },
        { id: "carol", role: "Observer" },
      ]);
    }
  });

  test("commander gets controls for allowed moves only", () => {
    expect(Object.keys(COMMANDER_MOVES)).toHaveLength(5);
    for (const phase of PHASE_ORDER) {
      const panel = incidentPanel(aliceScreen, play([{ type: "state", state: incidentAt(phase) }]));

      if (panel.kind !== "live" || panel.controls === null)
        throw new Error(`no controls at ${phase}`);
      expect(panel.controls.severity.options).toEqual(["SEV-1", "SEV-2", "SEV-3"]);
      expect(panel.controls.severity.value).toBe("SEV-2");
      expect(panel.controls.phases.map((c) => c.to).sort()).toEqual(
        [...COMMANDER_MOVES[phase]].sort(),
      );
    }
  });

  test("responder and observer get no controls", () => {
    const viewers = [
      connected(shellState("bob", "Responder")),
      connected(shellState("carol", "Observer")),
    ];
    expect(viewers.map((screen) => screen.kind)).toEqual(["connected", "connected"]);
    for (const screen of viewers) {
      for (const phase of PHASE_ORDER) {
        const panel = incidentPanel(
          screen,
          play([{ type: "state", state: incidentAt(phase, "SEV-3") }]),
        );

        if (panel.kind !== "live") throw new Error(`panel is ${panel.kind} at ${phase}`);
        expect(panel.sev).toBe("SEV-3");
        expect(panel.phases.filter((p) => p.current)).toEqual([{ phase, current: true }]);
        expect(panel.controls).toBeNull();
      }
    }
  });

  test("rejected call shows its error and keeps server state", () => {
    const state = incidentAt("TRIAGE", "SEV-1");
    const cases = [{ code: "forbidden" }, { code: "invalid" }] as const;

    for (const { code } of cases) {
      const snapshot = play([
        { type: "state", state },
        { type: "call-started" },
        { type: "call-rejected", code },
      ]);
      const panel = incidentPanel(aliceScreen, snapshot);

      if (panel.kind !== "live") throw new Error("panel is hidden");
      expect(panel.error).toBe(code);
      expect(panel.sev).toBe("SEV-1");
      expect(panel.phases.filter((p) => p.current)).toEqual([{ phase: "TRIAGE", current: true }]);
    }
  });

  test("no panel before the incident is live", () => {
    const withIncident = play([{ type: "state", state: incidentAt("MITIGATE") }]);
    const connecting = shellScreen(initialConnection);
    const reconnecting = shellScreen(
      playConnection([
        { type: "state", state: shellState("alice", "IC") },
        { type: "closed", close: { code: 1006, afterLive: true } },
      ]),
    );
    expect([connecting.kind, reconnecting.kind]).toEqual(["connecting", "reconnecting"]);

    for (const screen of [connecting, reconnecting]) {
      expect(incidentPanel(screen, withIncident)).toEqual({ kind: "hidden" });
    }
    // The shell can connect before the incident state arrives.
    expect(incidentPanel(aliceScreen, initialIncident)).toEqual({ kind: "hidden" });
  });

  test("controls are disabled while a call is pending", () => {
    const state = incidentAt("MITIGATE");
    const controlsAfter = (events: IncidentEvent[]) => {
      const panel = incidentPanel(aliceScreen, play([{ type: "state", state }, ...events]));
      if (panel.kind !== "live" || panel.controls === null) throw new Error("no controls");
      return panel.controls;
    };

    const pending = controlsAfter([{ type: "call-started" }]);
    expect(pending.phases).toHaveLength(2);
    expect(pending.severity.disabled).toBe(true);
    expect(pending.phases.map((c) => c.disabled)).toEqual([true, true]);

    for (const settled of [
      controlsAfter([{ type: "call-started" }, { type: "call-resolved" }]),
      controlsAfter([{ type: "call-started" }, { type: "call-rejected", code: "forbidden" }]),
    ]) {
      expect(settled.phases).toHaveLength(2);
      expect(settled.severity.disabled).toBe(false);
      expect(settled.phases.map((c) => c.disabled)).toEqual([false, false]);
    }
  });

  test("a new call clears the last error and a lost connection clears the incident", () => {
    const rejected = play([
      { type: "state", state: incidentAt("TRIAGE") },
      { type: "call-started" },
      { type: "call-rejected", code: "invalid" },
      { type: "call-started" },
    ]);
    const retried = incidentPanel(aliceScreen, rejected);
    if (retried.kind !== "live") throw new Error("panel is hidden");
    expect(retried.error).toBeNull();

    const lost = reduceIncident(rejected, { type: "connection-lost" });
    expect(incidentPanel(aliceScreen, lost)).toEqual({ kind: "hidden" });
  });

  test("rejection code names the Chord error code", () => {
    expect(rejectionCode(forbidden())).toBe("forbidden");
    expect(rejectionCode(invalid("transition", "no"))).toBe("invalid");
    expect(rejectionCode(new Error("socket closed"))).toBe("error");
  });
});
