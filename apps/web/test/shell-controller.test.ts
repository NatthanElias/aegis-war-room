import { afterEach, describe, expect, test } from "vitest";
import { makeTempIncidents } from "../../../test-support/incident-server.ts";
import { startServer } from "../../warroom-server/src/server.ts";
import type { IncidentSnapshot } from "../src/incident-view.ts";
import { type ShellController, startShell } from "../src/shell-controller.ts";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** The real controller on the real server, recording every incident snapshot it publishes. */
async function controllerFor(user: string) {
  const incidents = await makeTempIncidents();
  cleanups.push(incidents.remove);
  const server = await startServer(incidents.serverOptions());
  cleanups.push(() => server.close());
  const snapshots: IncidentSnapshot[] = [];
  const waiters = new Set<() => void>();
  const controller: ShellController = startShell(
    `ws://127.0.0.1:${server.port}/chord?user=${user}`,
    () => {},
    (snapshot) => {
      snapshots.push(snapshot);
      for (const waiter of [...waiters]) waiter();
    },
  );
  cleanups.push(() => controller.stop());
  const until = (predicate: (snapshot: IncidentSnapshot) => boolean, ms = 5000) =>
    new Promise<IncidentSnapshot>((resolve, reject) => {
      const check = () => {
        const match = snapshots.find(predicate);
        if (match === undefined) return;
        waiters.delete(check);
        clearTimeout(timer);
        resolve(match);
      };
      const timer = setTimeout(() => {
        waiters.delete(check);
        reject(new Error(`no matching snapshot; last ${JSON.stringify(snapshots.at(-1))}`));
      }, ms);
      waiters.add(check);
      check();
    });
  await until((snapshot) => snapshot.incident !== undefined);
  return { controller, snapshots, until };
}

describe("shell controller with the incident", () => {
  test("the commander's call is pending, then shows the server's new phase", async () => {
    const { controller, snapshots, until } = await controllerFor("alice");
    const before = snapshots.length;

    const call = controller.setPhase("TRIAGE");
    await call;
    const moved = await until((snapshot) => snapshot.incident?.phase === "TRIAGE");

    expect(moved.error).toBeUndefined();
    const sequence = snapshots.slice(before).map((s) => s.pending);
    expect(sequence[0]).toBe(true);
    expect(snapshots.at(-1)?.pending).toBe(false);
    expect(snapshots.at(-1)?.error).toBeUndefined();
  });

  test("a rejected call shows the server's code and keeps the server's state", async () => {
    const { controller, snapshots } = await controllerFor("bob");
    const before = snapshots.at(-1)?.incident;
    expect(before).toMatchObject({ phase: "DETECT", sev: "SEV-1" });

    await controller.setPhase("TRIAGE");

    const last = snapshots.at(-1);
    expect(last?.error).toBe("forbidden");
    expect(last?.pending).toBe(false);
    expect(last?.incident).toEqual(before);
  });

  test("severity and phase calls reach their own methods", async () => {
    const { controller, until } = await controllerFor("alice");

    await controller.setSev("SEV-3");
    const changed = await until((snapshot) => snapshot.incident?.sev === "SEV-3");

    expect(changed.incident?.phase).toBe("DETECT");
  });
});
