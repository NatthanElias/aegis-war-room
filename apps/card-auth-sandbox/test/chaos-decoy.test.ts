import type { SandboxAcquirerTelemetry, SandboxPoolTelemetry } from "@warroom/contracts";
import { afterAll, afterEach, describe, expect, test } from "vitest";
import { createHarness, getJson, sleep } from "./support.ts";

const VISA = "4111111111111111";
const MASTERCARD = "5555555555554444";

/** `PUT /chaos/scenario` on the sandbox's control listener; the body is written out so the test pins the wire format. */
async function setScenario(chaosPort: number | undefined, scenario: string): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${chaosPort}/chaos/scenario`, {
    method: "PUT",
    body: `{"scenario":"${scenario}"}`,
  });
  expect(response.status, `PUT scenario ${scenario}`).toBe(200);
}

/** Milliseconds one request takes from start to a fully read answer. */
async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const startedAt = performance.now();
  const value = await run();
  return { value, ms: performance.now() - startedAt };
}

/** `GET path` with a 5 s abort, so a route that hangs shows up as status 0 and a long time instead of a test timeout. */
async function timedGet(sandbox: { readonly port: number }, path: string) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`http://127.0.0.1:${sandbox.port}${path}`, {
      signal: AbortSignal.timeout(5000),
    });
    const body: unknown = await response.json();
    return { status: response.status, body, ms: performance.now() - startedAt };
  } catch {
    return { status: 0, body: undefined, ms: performance.now() - startedAt };
  }
}

describe("cascade decoy on an idle pool", () => {
  const harness = createHarness();
  afterEach(() => harness.cleanup());

  async function decoySandbox() {
    const db = await harness.migratedDatabase();
    const sandbox = await harness.sandbox(db, { chaosPort: 0 });
    await setScenario(sandbox.chaosPort, "cascade-decoy");
    return sandbox;
  }

  test("acquirer-beta takes eight seconds", async () => {
    const sandbox = await decoySandbox();
    const startedAt = Date.now();

    const { value, ms } = await timed(() => sandbox.authorize(MASTERCARD, 1000));

    expect(value.acquirer).toBe("acquirer-beta");
    expect(value.status).toBe("APPROVED");
    expect(ms).toBeGreaterThanOrEqual(8000);
    expect(ms).toBeLessThan(9000);
    const since = new Date(startedAt - 1000).toISOString();
    const until = new Date(Date.now() + 1000).toISOString();
    const listed = await getJson(
      sandbox,
      `/telemetry/authorizations?since=${since}&until=${until}&acquirer=acquirer-beta`,
    );
    expect(listed.status).toBe(200);
    const { authorizations } = listed.body as {
      authorizations: Array<{ acquirer: string; latencyMs: number | null }>;
    };
    expect(authorizations).toHaveLength(1);
    expect(authorizations[0]?.acquirer).toBe("acquirer-beta");
    expect(authorizations[0]?.latencyMs).toBeGreaterThanOrEqual(8000);
  });

  test("acquirer-alpha stays fast", async () => {
    const sandbox = await decoySandbox();

    const { value, ms } = await timed(() => sandbox.authorize(VISA, 1000));

    expect(value.acquirer).toBe("acquirer-alpha");
    expect(value.status).toBe("APPROVED");
    expect(ms).toBeLessThan(1000);
  });
});

// Context: these three checks share one saturation (about 25 s with the drain). The first of them to run builds
// it, so each still passes when run alone with -t; the order below is the order they run in a full file run.
describe("cascade decoy with synthetic traffic", () => {
  const harness = createHarness();
  afterAll(() => harness.cleanup());

  interface Scene {
    readonly sandbox: Awaited<ReturnType<typeof harness.sandbox>>;
    /** The last `/telemetry/pool` reading of the saturation poll. */
    readonly pool: SandboxPoolTelemetry;
    /** The last count of `idle in transaction` sandbox sessions in this test's database. */
    readonly heldSessions: number;
    readonly saturatedAfterMs: number;
    readonly saturated: boolean;
  }

  let scene: Promise<Scene> | undefined;

  async function buildScene(): Promise<Scene> {
    const db = await harness.migratedDatabase();
    const diag = await harness.client(db.roleUrl("warroom_diag"));
    const sandbox = await harness.sandbox(db, { trafficRate: 5, chaosPort: 0 });
    // Why: a healthy baseline makes the injected fault the only change before saturation.
    await sleep(500);
    const startedAt = performance.now();
    await setScenario(sandbox.chaosPort, "cascade-decoy");

    let pool: SandboxPoolTelemetry;
    let heldSessions: number;
    let saturated: boolean;
    do {
      pool = (await getJson(sandbox, "/telemetry/pool")).body as SandboxPoolTelemetry;
      const held = await diag.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity
         WHERE application_name = 'card-auth-sandbox' AND state = 'idle in transaction'
           AND datname = current_database()`,
      );
      heldSessions = held.rows[0].n;
      saturated = pool.total === 10 && pool.idle === 0 && pool.waiting >= 1 && heldSessions === 10;
      if (!saturated) await sleep(25);
    } while (!saturated && performance.now() - startedAt < 10_000);
    return {
      sandbox,
      pool,
      heldSessions,
      saturatedAfterMs: performance.now() - startedAt,
      saturated,
    };
  }

  const saturate = () => {
    scene ??= buildScene();
    return scene;
  };

  test("saturates the app pool", async () => {
    const { pool, heldSessions, saturatedAfterMs } = await saturate();

    expect(pool.total).toBe(10);
    expect(pool.idle).toBe(0);
    expect(pool.waiting).toBeGreaterThanOrEqual(1);
    expect(heldSessions).toBe(10);
    expect(saturatedAfterMs).toBeLessThan(10_000);
  });

  test("telemetry answers while saturated", async () => {
    const { sandbox } = await saturate();

    const poolAnswer = await timedGet(sandbox, "/telemetry/pool");
    const acquirersAnswer = await timedGet(sandbox, "/telemetry/acquirers?windowSec=60");

    expect(poolAnswer.status).toBe(200);
    expect(poolAnswer.ms).toBeLessThan(500);
    expect(acquirersAnswer.status).toBe(200);
    expect(acquirersAnswer.ms).toBeLessThan(500);
    // Why: measuring after the pool drains would not prove telemetry works during saturation.
    const pool = poolAnswer.body as SandboxPoolTelemetry;
    expect(pool.idle).toBe(0);
    expect(pool.waiting).toBeGreaterThanOrEqual(1);
    const { acquirers } = acquirersAnswer.body as SandboxAcquirerTelemetry;
    expect(acquirers["acquirer-beta"].inFlight).toBeGreaterThanOrEqual(1);
  });

  test("clear drains the pool", async () => {
    const { sandbox } = await saturate();
    const before = (await getJson(sandbox, "/telemetry/pool")).body as SandboxPoolTelemetry;
    expect(before.waiting).toBeGreaterThanOrEqual(1);

    const startedAt = performance.now();
    await setScenario(sandbox.chaosPort, "none");
    let pool: SandboxPoolTelemetry;
    do {
      pool = (await getJson(sandbox, "/telemetry/pool")).body as SandboxPoolTelemetry;
      if (pool.waiting !== 0) await sleep(50);
    } while (pool.waiting !== 0 && performance.now() - startedAt < 15_000);

    expect(pool.waiting).toBe(0);
    expect(performance.now() - startedAt).toBeLessThan(15_000);
    const { value, ms } = await timed(() => sandbox.authorize(MASTERCARD, 1000));
    expect(value.acquirer).toBe("acquirer-beta");
    expect(ms).toBeLessThan(1000);
  });
});
