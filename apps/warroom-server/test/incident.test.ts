import { isChordError } from "@earendil-works/chord";
import { Incident, type IncidentState, type Phase, type Severity } from "@warroom/contracts";
import { afterEach, describe, expect, test } from "vitest";
import { type OpenIncident, openIncident } from "../../../test-support/incident-client.ts";
import { makeTempIncidents, SEEDED_ROSTER } from "../../../test-support/incident-server.ts";
import { startServer } from "../src/server.ts";

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
  let server = await startServer(incidents.serverOptions());
  let running = true;
  cleanups.push(async () => {
    if (running) await server.close();
  });
  const connect = async (user: string): Promise<OpenIncident> => {
    const connection = await openIncident(server.port, user);
    cleanups.push(async () => connection.close());
    return connection;
  };
  return {
    incidents,
    get server() {
      return server;
    },
    connect,
    /** Closes the server and opens a new one on the same incident file. Earlier connections end. */
    async restart() {
      running = false;
      await server.close();
      server = await startServer(incidents.serverOptions());
      running = true;
    },
    /** Closes the server for good, so the file can be read through the store. */
    async stop() {
      running = false;
      await server.close();
    },
  };
}

/** The error a promise rejects with, or undefined when it resolves. */
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );

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

    const error = await rejection(server.chord.root((ctx) => ctx.get(Incident, {})));

    expect(isChordError(error, "forbidden")).toBe(true);
  });
});

/** Waits long enough for a wrongly published change to have reached a connection. */
const settle = () => new Promise((resolve) => setTimeout(resolve, LIVE_BOUND_MS));

describe("warroom.incident roles", () => {
  test("responder cannot change the phase", async () => {
    const stage = await startIncident((doc) => {
      doc.phase = "TRIAGE";
    });
    const alice = await stage.connect("alice");
    const bob = await stage.connect("bob");

    const error = await rejection(bob.setPhase("MITIGATE"));
    await settle();

    expect(isChordError(error, "forbidden")).toBe(true);
    expect(alice.states.map((s) => s.phase)).toEqual(["TRIAGE"]);
    expect(bob.states.map((s) => s.phase)).toEqual(["TRIAGE"]);
    await stage.restart();
    expect((await stage.connect("alice")).latest().phase).toBe("TRIAGE");
  });

  test("observer cannot change phase or severity", async () => {
    const stage = await startIncident();
    const alice = await stage.connect("alice");
    const bob = await stage.connect("bob");
    const carol = await stage.connect("carol");

    const phaseError = await rejection(carol.setPhase("TRIAGE"));
    const sevError = await rejection(carol.setSev("SEV-3"));
    await settle();

    expect(isChordError(phaseError, "forbidden")).toBe(true);
    expect(isChordError(sevError, "forbidden")).toBe(true);
    for (const connection of [alice, bob, carol]) {
      expect(connection.states.map((s) => [s.phase, s.sev])).toEqual([["DETECT", "SEV-1"]]);
    }
    await stage.restart();
    expect((await stage.connect("carol")).latest()).toMatchObject({
      phase: "DETECT",
      sev: "SEV-1",
    });
  });

  test("responder cannot change the severity", async () => {
    const stage = await startIncident();
    const alice = await stage.connect("alice");
    const bob = await stage.connect("bob");

    const error = await rejection(bob.setSev("SEV-3"));
    await settle();

    expect(isChordError(error, "forbidden")).toBe(true);
    expect(alice.states.map((s) => s.sev)).toEqual(["SEV-1"]);
    expect(bob.states.map((s) => s.sev)).toEqual(["SEV-1"]);
    await stage.restart();
    expect((await stage.connect("bob")).latest().sev).toBe("SEV-1");
  });
});

// Why: written out here on purpose, so a wrong PHASE_TRANSITIONS in production cannot make these tests agree with it.
const PHASE_NAMES = ["DETECT", "TRIAGE", "MITIGATE", "RESOLVE", "POSTMORTEM"] as const;
const ALLOWED: ReadonlyArray<readonly [Phase, Phase]> = [
  ["DETECT", "TRIAGE"],
  ["TRIAGE", "MITIGATE"],
  ["MITIGATE", "RESOLVE"],
  ["MITIGATE", "TRIAGE"],
  ["RESOLVE", "POSTMORTEM"],
  ["RESOLVE", "MITIGATE"],
];
const DISALLOWED: ReadonlyArray<readonly [Phase, Phase]> = [
  ["DETECT", "DETECT"],
  ["DETECT", "MITIGATE"],
  ["DETECT", "RESOLVE"],
  ["DETECT", "POSTMORTEM"],
  ["TRIAGE", "DETECT"],
  ["TRIAGE", "TRIAGE"],
  ["TRIAGE", "RESOLVE"],
  ["TRIAGE", "POSTMORTEM"],
  ["MITIGATE", "DETECT"],
  ["MITIGATE", "MITIGATE"],
  ["MITIGATE", "POSTMORTEM"],
  ["RESOLVE", "DETECT"],
  ["RESOLVE", "TRIAGE"],
  ["RESOLVE", "RESOLVE"],
  ["POSTMORTEM", "DETECT"],
  ["POSTMORTEM", "TRIAGE"],
  ["POSTMORTEM", "MITIGATE"],
  ["POSTMORTEM", "RESOLVE"],
  ["POSTMORTEM", "POSTMORTEM"],
];

describe("warroom.incident phase transitions", () => {
  test("disallowed transitions are rejected: the tables cover all 25 pairs", () => {
    const pairs = [...ALLOWED, ...DISALLOWED].map(([from, to]) => `${from} -> ${to}`);
    const everyPair = PHASE_NAMES.flatMap((from) => PHASE_NAMES.map((to) => `${from} -> ${to}`));

    expect(ALLOWED).toHaveLength(6);
    expect(DISALLOWED).toHaveLength(19);
    expect(new Set(pairs).size).toBe(25);
    expect([...pairs].sort()).toEqual([...everyPair].sort());
  });

  test.each(ALLOWED)("allowed transitions commit: %s -> %s", async (from, to) => {
    const { connect } = await startIncident((doc) => {
      doc.phase = from;
    });
    const alice = await connect("alice");
    expect(alice.latest().phase).toBe(from);

    await alice.setPhase(to);

    const shown = await alice.waitFor((state) => state.phase === to, LIVE_BOUND_MS, 1);
    expect(shown.phase).toBe(to);
  });

  test.each(DISALLOWED)("disallowed transitions are rejected: %s -> %s", async (from, to) => {
    const stage = await startIncident((doc) => {
      doc.phase = from;
    });
    const alice = await stage.connect("alice");

    const error = await rejection(alice.setPhase(to));
    await settle();

    expect(isChordError(error, "invalid")).toBe(true);
    expect(alice.states.map((s) => s.phase)).toEqual([from]);
    await stage.stop();
    expect((await stage.incidents.read()).phase).toBe(from);
  });

  test("out of schema values are rejected", async () => {
    const stage = await startIncident((doc) => {
      doc.phase = "TRIAGE";
    });
    const alice = await stage.connect("alice");
    const bob = await stage.connect("bob");

    const errors = await Promise.all([
      rejection(alice.setPhase("popcorn" as Phase)),
      rejection(alice.setPhase(undefined as unknown as Phase)),
      rejection(alice.setSev("pop corn" as Severity)),
      rejection(alice.setSev("SEV-4" as Severity)),
    ]);
    await settle();

    for (const error of errors) expect(isChordError(error, "invalid"), String(error)).toBe(true);
    for (const connection of [alice, bob]) {
      expect(connection.states.map((s) => [s.phase, s.sev])).toEqual([["TRIAGE", "SEV-1"]]);
    }
    await stage.stop();
    expect(await stage.incidents.read()).toMatchObject({ phase: "TRIAGE", sev: "SEV-1" });
  });

  test("concurrent identical moves commit once", async () => {
    const { connect } = await startIncident((doc) => {
      doc.phase = "TRIAGE";
    });
    const first = await connect("alice");
    const second = await connect("alice");
    const bob = await connect("bob");

    const results = await Promise.allSettled([
      first.setPhase("MITIGATE"),
      second.setPhase("MITIGATE"),
    ]);
    await bob.waitFor((state) => state.phase === "MITIGATE", LIVE_BOUND_MS, 1);
    await settle();

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(isChordError((rejected[0] as PromiseRejectedResult).reason, "invalid")).toBe(true);
    expect(first.latest().phase).toBe("MITIGATE");
    expect(bob.states.map((s) => s.phase)).toEqual(["TRIAGE", "MITIGATE"]);
  });
});
