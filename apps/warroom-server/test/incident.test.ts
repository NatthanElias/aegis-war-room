import { isChordError } from "@earendil-works/chord";
import { Incident, type IncidentState, type Phase, type Severity } from "@warroom/contracts";
import { afterEach, describe, expect, test } from "vitest";
import { type OpenIncident, openIncident } from "../../../test-support/incident-client.ts";
import { makeTempIncidents, SEEDED_ROSTER } from "../../../test-support/incident-server.ts";
import { type RunningServer, startServer } from "../src/server.ts";

/** The bound for a call to resolve, and for every connection to show its result, measured from the call starting. */
const LIVE_BOUND_MS = 250;

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A temporary incident folder, optionally seeded before the server opens it, and a server on it. */
async function startIncident(seed?: (doc: { phase: Phase; sev: Severity }) => void) {
  const incidents = await makeTempIncidents();
  cleanups.push(incidents.remove);
  if (seed) await incidents.seed(seed);
  const server = await startServer(incidents.serverOptions());
  cleanups.push(() => server.close());
  const connect = async (user: string): Promise<OpenIncident> => {
    const connection = await openIncident(server.port, user);
    cleanups.push(async () => connection.close());
    return connection;
  };
  return { incidents, server, connect };
}

/** Milliseconds from `started` until `promise` settles, with how it settled. */
async function settledAfter(promise: Promise<unknown>, started: number) {
  const outcome = await promise.then(
    () => "resolved" as const,
    () => "rejected" as const,
  );
  return { outcome, ms: performance.now() - started };
}

/**
 * Starts `call`, then reports when it resolved and when each connection first showed a state satisfying `shown`.
 * Why: a timing failure needs the phase it happened in (commit, mirror, or delivery), so every phase is kept.
 */
async function timeChange(
  call: () => Promise<void>,
  watchers: Record<string, OpenIncident>,
  shown: (state: IncidentState) => boolean,
) {
  const marks = Object.fromEntries(
    Object.entries(watchers).map(([name, w]) => [name, w.states.length]),
  );
  const started = performance.now();
  const pending = {
    call: settledAfter(call(), started),
    ...Object.fromEntries(
      Object.entries(watchers).map(([name, watcher]) => [
        name,
        settledAfter(watcher.waitFor(shown, LIVE_BOUND_MS, marks[name]), started),
      ]),
    ),
  };
  const entries = await Promise.all(Object.entries(pending).map(async ([k, v]) => [k, await v]));
  return Object.fromEntries(entries) as Record<
    string,
    { outcome: "resolved" | "rejected"; ms: number }
  >;
}

describe("warroom.incident state", () => {
  test.each(["alice", "bob", "carol"])(
    "every seeded user receives incident state: %s",
    async (user) => {
      const { connect } = await startIncident();

      const connection = await connect(user);

      expect(connection.states).toEqual([{ sev: "SEV-1", phase: "DETECT", roster: SEEDED_ROSTER }]);
    },
  );

  test("phase change reaches every connection", async () => {
    const { connect } = await startIncident((doc) => {
      doc.phase = "TRIAGE";
    });
    const alice = await connect("alice");
    const bob = await connect("bob");
    expect(alice.states.map((s) => s.phase)).toEqual(["TRIAGE"]);
    expect(bob.states.map((s) => s.phase)).toEqual(["TRIAGE"]);

    const timing = await timeChange(
      () => alice.setPhase("MITIGATE"),
      { alice, bob },
      (s) => s.phase === "MITIGATE",
    );

    const evidence = JSON.stringify(timing);
    expect(timing.call?.outcome, evidence).toBe("resolved");
    for (const [name, mark] of Object.entries(timing)) {
      expect(mark.outcome, `${name}: ${evidence}`).toBe("resolved");
      expect(mark.ms, `${name}: ${evidence}`).toBeLessThan(LIVE_BOUND_MS);
    }
    // Why: one first state and one change per connection means neither reconnected or re-hydrated.
    expect(alice.states.map((s) => s.phase)).toEqual(["TRIAGE", "MITIGATE"]);
    expect(bob.states.map((s) => s.phase)).toEqual(["TRIAGE", "MITIGATE"]);
  });

  test("severity change reaches every connection", async () => {
    const { connect } = await startIncident();
    const alice = await connect("alice");
    const bob = await connect("bob");

    for (const sev of ["SEV-2", "SEV-3", "SEV-1"] as const) {
      const timing = await timeChange(
        () => alice.setSev(sev),
        { alice, bob },
        (s) => s.sev === sev,
      );

      const evidence = `${sev}: ${JSON.stringify(timing)}`;
      expect(timing.call?.outcome, evidence).toBe("resolved");
      for (const [name, mark] of Object.entries(timing)) {
        expect(mark.outcome, `${name} ${evidence}`).toBe("resolved");
        expect(mark.ms, `${name} ${evidence}`).toBeLessThan(LIVE_BOUND_MS);
      }
    }
    expect(alice.states.map((s) => s.sev)).toEqual(["SEV-1", "SEV-2", "SEV-3", "SEV-1"]);
    expect(bob.states.map((s) => s.sev)).toEqual(["SEV-1", "SEV-2", "SEV-3", "SEV-1"]);

    // Setting the current value resolves and writes nothing new.
    const before = bob.states.length;
    await alice.setSev("SEV-1");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(alice.latest().sev).toBe("SEV-1");
    expect(bob.latest().sev).toBe("SEV-1");
    expect(bob.states).toHaveLength(before);
  });
});

describe("warroom.incident access", () => {
  test("server principal is refused", async () => {
    const { server } = await startIncident();
    const host: RunningServer["chord"] = server.chord;

    const error = await host
      .root((ctx) => ctx.get(Incident, {}))
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(isChordError(error, "forbidden")).toBe(true);
  });
});
