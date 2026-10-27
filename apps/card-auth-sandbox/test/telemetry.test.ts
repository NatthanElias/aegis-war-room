import {
  SandboxAcquirerTelemetry,
  SandboxAuthorizationList,
  SandboxPoolTelemetry,
} from "@warroom/contracts";
import Value from "typebox/value";
import { afterEach, describe, expect, test } from "vitest";
import { createHarness, getJson, sleep, waitFor } from "./support.ts";

const harness = createHarness();
afterEach(() => harness.cleanup());

const VISA = "4111111111111111";
const MASTERCARD = "5555555555554444";

async function newSandbox() {
  const db = await harness.migratedDatabase();
  return { db, sandbox: await harness.sandbox(db) };
}

describe("telemetry", () => {
  test("acquirer counts and latency", async () => {
    const { sandbox } = await newSandbox();
    const empty = await getJson(sandbox, "/telemetry/acquirers?windowSec=60");
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({
      acquirers: {
        "acquirer-alpha": { approved: 0, declined: 0, errors: 0, inFlight: 0, latencyMs: null },
        "acquirer-beta": { approved: 0, declined: 0, errors: 0, inFlight: 0, latencyMs: null },
      },
    });

    for (const cents of [1000, 2000, 3000, 1051]) await sandbox.authorize(VISA, cents);
    for (const cents of [1000, 2000]) await sandbox.authorize(MASTERCARD, cents);
    const full = await getJson(sandbox, "/telemetry/acquirers?windowSec=60");

    expect(full.status).toBe(200);
    expect(Value.Check(SandboxAcquirerTelemetry, full.body)).toBe(true);
    const { acquirers } = full.body as SandboxAcquirerTelemetry;
    expect(acquirers["acquirer-alpha"]).toMatchObject({
      approved: 3,
      declined: 1,
      errors: 0,
      inFlight: 0,
      oldestInFlightMs: null,
    });
    expect(acquirers["acquirer-beta"]).toMatchObject({
      approved: 2,
      declined: 0,
      errors: 0,
      inFlight: 0,
      oldestInFlightMs: null,
    });
    for (const [name, floorMs] of [
      ["acquirer-alpha", 75],
      ["acquirer-beta", 115],
    ] as const) {
      const latency = acquirers[name].latencyMs;
      // The floors are the plan's base latencies (80 and 120 ms) less 5 ms of timer slack.
      expect(latency?.p50, name).toBeGreaterThanOrEqual(floorMs);
      expect(latency?.max, name).toBeLessThan(1000);
      expect(latency?.p50 as number, name).toBeLessThanOrEqual(latency?.p95 as number);
      expect(latency?.p95 as number, name).toBeLessThanOrEqual(latency?.max as number);
    }

    await sleep(1200);
    const narrow = await getJson(sandbox, "/telemetry/acquirers?windowSec=1");
    expect(narrow.status).toBe(200);
    expect((narrow.body as SandboxAcquirerTelemetry).acquirers).toMatchObject({
      "acquirer-alpha": { approved: 0, declined: 0 },
      "acquirer-beta": { approved: 0, declined: 0 },
    });
  });

  test("rejects an invalid window", async () => {
    const { sandbox } = await newSandbox();

    for (const value of ["0", "301", "1.5", "abc", ""]) {
      const response = await getJson(sandbox, `/telemetry/acquirers?windowSec=${value}`);
      expect(response.status, `windowSec=${value}`).toBe(400);
      expect(response.body, `windowSec=${value}`).toEqual({ error: "invalid_window" });
    }
    for (const [query, expected] of [
      ["?windowSec=1", 1],
      ["?windowSec=300", 300],
      ["", 60],
    ] as const) {
      const response = await getJson(sandbox, `/telemetry/acquirers${query}`);
      expect(response.status, query).toBe(200);
      expect((response.body as { windowSec: number }).windowSec, query).toBe(expected);
    }
  });

  test("lists authorizations", async () => {
    const { sandbox } = await newSandbox();
    const pans = [
      "4111111111111111",
      "5555555555554444",
      "4242424242424242",
      "5105105105105100",
      "4012888888881881",
    ];
    const traceIds: string[] = [];
    for (const pan of pans) traceIds.push((await sandbox.authorize(pan, 1234)).traceId);
    const range = `since=${new Date(Date.now() - 60_000).toISOString()}&until=${new Date(Date.now() + 5000).toISOString()}`;

    const all = await getJson(sandbox, `/telemetry/authorizations?${range}`);

    expect(all.status).toBe(200);
    expect(Value.Check(SandboxAuthorizationList, all.body)).toBe(true);
    const { authorizations } = all.body as SandboxAuthorizationList;
    expect(authorizations.map((entry) => entry.traceId)).toEqual([...traceIds].reverse());
    expect(authorizations[0]).toMatchObject({
      bin: "401288",
      last4: "1881",
      status: "APPROVED",
      acquirer: "acquirer-alpha",
    });
    expect(authorizations[0]?.latencyMs).toBeGreaterThanOrEqual(75);
    for (const pan of pans) expect(all.text).not.toContain(pan);

    const limited = await getJson(sandbox, `/telemetry/authorizations?${range}&limit=2`);
    expect(limited.status).toBe(200);
    expect(
      (limited.body as SandboxAuthorizationList).authorizations.map((entry) => entry.traceId),
    ).toEqual([traceIds[4], traceIds[3]]);

    const beta = await getJson(
      sandbox,
      `/telemetry/authorizations?${range}&acquirer=acquirer-beta`,
    );
    expect(beta.status).toBe(200);
    const betaList = (beta.body as SandboxAuthorizationList).authorizations;
    expect(betaList.map((entry) => entry.traceId)).toEqual([traceIds[3], traceIds[1]]);
    expect(betaList.every((entry) => entry.acquirer === "acquirer-beta")).toBe(true);
  });

  test("rejects an invalid range", async () => {
    const { sandbox } = await newSandbox();
    const base = Date.parse("2026-10-27T12:00:00.000Z");
    const iso = (offsetSec: number) => new Date(base + offsetSec * 1000).toISOString();
    const since = iso(0);
    const until = iso(60);
    const invalidRange = [
      `until=${until}`,
      `since=${since}`,
      `since=yesterday&until=${until}`,
      `since=${until}&until=${since}`,
      `since=${since}&until=${iso(3601)}`,
    ];
    expect(invalidRange).toHaveLength(5);

    for (const query of invalidRange) {
      const response = await getJson(sandbox, `/telemetry/authorizations?${query}`);
      expect(response.status, query).toBe(400);
      expect(response.body, query).toEqual({ error: "invalid_range" });
    }

    const edge = await getJson(
      sandbox,
      `/telemetry/authorizations?since=${since}&until=${iso(3600)}`,
    );
    expect(edge.status).toBe(200);
    const range = `since=${since}&until=${until}`;
    const gamma = await getJson(
      sandbox,
      `/telemetry/authorizations?${range}&acquirer=acquirer-gamma`,
    );
    expect(gamma.status).toBe(400);
    expect(gamma.body).toEqual({ error: "invalid_acquirer" });
    for (const limit of ["0", "501", "x"]) {
      const response = await getJson(sandbox, `/telemetry/authorizations?${range}&limit=${limit}`);
      expect(response.status, `limit=${limit}`).toBe(400);
      expect(response.body, `limit=${limit}`).toEqual({ error: "invalid_limit" });
    }
    for (const limit of ["1", "500"]) {
      const response = await getJson(sandbox, `/telemetry/authorizations?${range}&limit=${limit}`);
      expect(response.status, `limit=${limit}`).toBe(200);
    }
  });

  test("rejects a date that is not ISO 8601 even if Date.parse accepts it", async () => {
    const { sandbox } = await newSandbox();
    const until = encodeURIComponent("2026-10-27T13:00:00Z");

    for (const since of ["Oct 27 2026 12:00 GMT", "2026/10/27", "1761566400000"]) {
      const response = await getJson(
        sandbox,
        `/telemetry/authorizations?since=${encodeURIComponent(since)}&until=${until}`,
      );
      expect(response.status, since).toBe(400);
      expect(response.body, since).toEqual({ error: "invalid_range" });
    }
    const ok = await getJson(
      sandbox,
      `/telemetry/authorizations?since=2026-10-27T12:00:00%2B00:00&until=${until}`,
    );
    expect(ok.status).toBe(200);
  });

  test("pool counters", async () => {
    const { sandbox } = await newSandbox();
    await sandbox.authorize(VISA, 1000);
    const { pool } = sandbox;
    // Why: the sandbox's own health ping briefly checks a connection out once a second, so a reading only
    // counts when the pool's counters were the same before and after the request.
    const readStable = async () => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const before = [pool.totalCount, pool.idleCount, pool.waitingCount];
        const response = await getJson(sandbox, "/telemetry/pool");
        const after = [pool.totalCount, pool.idleCount, pool.waitingCount];
        if (before.join() === after.join()) return { response, counters: before };
      }
      throw new Error("pool counters never settled");
    };

    const idle = await readStable();

    expect(idle.response.status).toBe(200);
    expect(Value.Check(SandboxPoolTelemetry, idle.response.body)).toBe(true);
    expect(idle.response.body).toEqual({
      max: 10,
      total: idle.counters[0],
      idle: idle.counters[1],
      waiting: idle.counters[2],
    });
    expect(idle.counters[0]).toBeGreaterThanOrEqual(1);

    // Twelve held transactions saturate the pool of 10 and leave 2 waiting, so no counter is at its idle value.
    sandbox.setAcquirerDelay("acquirer-beta", 3000);
    for (let i = 0; i < 12; i++) sandbox.authorize(MASTERCARD, 1000).catch(() => undefined);
    await waitFor(
      "a saturated pool",
      () => (pool.totalCount === 10 && pool.waitingCount >= 1 ? true : undefined),
      3000,
    );
    const busy = await readStable();

    expect(busy.response.status).toBe(200);
    expect(busy.response.body).toEqual({
      max: 10,
      total: busy.counters[0],
      idle: busy.counters[1],
      waiting: busy.counters[2],
    });
    expect(busy.counters[0]).toBe(10);
    expect(busy.counters[1]).toBe(0);
    expect(busy.counters[2]).toBeGreaterThanOrEqual(1);
  });

  test("answers while the pool is saturated", async () => {
    const { sandbox } = await newSandbox();
    sandbox.setAcquirerDelay("acquirer-beta", 3000);
    for (let i = 0; i < 12; i++) sandbox.authorize(MASTERCARD, 1000).catch(() => undefined);
    await waitFor(
      "a saturated pool",
      async () => {
        const pool = (await getJson(sandbox, "/telemetry/pool")).body as SandboxPoolTelemetry;
        return pool.total === 10 && pool.waiting >= 1 ? pool : undefined;
      },
      5000,
    );
    const now = Date.now();
    const range = `since=${new Date(now - 60_000).toISOString()}&until=${new Date(now + 5000).toISOString()}`;

    for (const path of [
      "/telemetry/acquirers",
      `/telemetry/authorizations?${range}`,
      "/telemetry/pool",
    ]) {
      const startedAt = Date.now();
      const response = await getJson(sandbox, path);
      expect(response.status, path).toBe(200);
      expect(Date.now() - startedAt, path).toBeLessThan(500);
    }
  });
});
