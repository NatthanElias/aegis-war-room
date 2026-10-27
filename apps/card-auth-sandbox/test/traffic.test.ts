import type { SandboxAcquirerTelemetry } from "@warroom/contracts";
import { afterEach, describe, expect, test } from "vitest";
import { routeBin } from "../src/routing.ts";
import { resolveTrafficRate, syntheticPan, TEST_BINS } from "../src/traffic.ts";
import { createHarness, getJson, sleep, waitFor } from "./support.ts";

const harness = createHarness();
afterEach(() => harness.cleanup());

/** The standard Luhn check, written from the algorithm's definition and independent of `luhnCheckDigit`. */
function luhnValid(pan: string): boolean {
  const digits = pan.split("").reverse().map(Number);
  const sum = digits.reduce((total, digit, index) => {
    if (index % 2 === 0) return total + digit;
    return total + (digit * 2 > 9 ? digit * 2 - 9 : digit * 2);
  }, 0);
  return sum % 10 === 0;
}

describe("traffic", () => {
  test("generates traffic", async () => {
    const db = await harness.migratedDatabase();
    const admin = await harness.client(db.url);
    const startedAt = Date.now();
    await harness.sandbox(db, { trafficRate: 5 });

    const rows = await waitFor(
      "10 committed rows covering both acquirers",
      async () => {
        const result = await admin.query("SELECT acquirer, bin FROM card_holds");
        const acquirers = new Set(result.rows.map((row) => row.acquirer));
        return result.rows.length >= 10 && acquirers.size === 2 ? result.rows : undefined;
      },
      5000 - (Date.now() - startedAt),
    );

    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(new Set(rows.map((row) => row.acquirer))).toEqual(
      new Set(["acquirer-alpha", "acquirer-beta"]),
    );
    const allowed = ["411111", "424242", "555555", "510510", "222300"];
    for (const row of rows) expect(allowed, `bin ${row.bin}`).toContain(row.bin);
  });

  test("no traffic when rate is 0", async () => {
    const db = await harness.migratedDatabase();
    const admin = await harness.client(db.url);
    const sandbox = await harness.sandbox(db, { trafficRate: 0 });

    await sleep(2000);

    expect((await admin.query("SELECT count(*)::int AS n FROM card_holds")).rows[0].n).toBe(0);
    const response = await getJson(sandbox, "/telemetry/acquirers");
    expect(response.status).toBe(200);
    const { acquirers, dropped } = response.body as SandboxAcquirerTelemetry;
    expect(dropped).toBe(0);
    for (const name of ["acquirer-alpha", "acquirer-beta"] as const) {
      expect(acquirers[name], name).toMatchObject({
        approved: 0,
        declined: 0,
        errors: 0,
        inFlight: 0,
        oldestInFlightMs: null,
        latencyMs: null,
      });
    }
    expect(resolveTrafficRate({})).toBe(0);
    expect(resolveTrafficRate({ TRAFFIC_RATE: "" })).toBe(0);
    expect(resolveTrafficRate({ TRAFFIC_RATE: "5" })).toBe(5);
  });

  test("caps in-flight at 50", async () => {
    const db = await harness.migratedDatabase();
    const sandbox = await harness.sandbox(db, { trafficRate: 100 });
    sandbox.setAcquirerDelay("acquirer-alpha", 5000);
    sandbox.setAcquirerDelay("acquirer-beta", 5000);

    const readings: SandboxAcquirerTelemetry[] = [];
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const response = await getJson(sandbox, "/telemetry/acquirers");
      expect(response.status).toBe(200);
      readings.push(response.body as SandboxAcquirerTelemetry);
      await sleep(50);
    }

    expect(readings.length).toBeGreaterThan(10);
    const inFlight = readings.map(
      (reading) =>
        reading.acquirers["acquirer-alpha"].inFlight + reading.acquirers["acquirer-beta"].inFlight,
    );
    expect(Math.max(...inFlight)).toBe(50);
    expect(readings[readings.length - 1]?.dropped).toBeGreaterThanOrEqual(1);
  });

  test("builds Luhn-valid test card numbers that route to a brand", () => {
    expect(TEST_BINS).toHaveLength(5);

    for (const bin of ["411111", "424242", "555555", "510510", "222300"]) {
      const pan = syntheticPan(bin);
      expect(pan, bin).toMatch(/^\d{16}$/);
      expect(pan.startsWith(bin), bin).toBe(true);
      expect(luhnValid(pan), `${bin} -> ${pan}`).toBe(true);
      expect(routeBin(pan), bin).not.toBe("unsupported_bin");
    }
    // With every filler digit 0 the Luhn sum is 8 + 1 + 2 + 1 + 2 + 1 = 15, so the check digit is 5 (worked by hand).
    expect(syntheticPan("411111", () => 0)).toBe("4111110000000005");
  });

  test("rejects a TRAFFIC_RATE that is not a whole number from 0 to 1000", () => {
    for (const raw of ["abc", "1.5", "-1", "1001"]) {
      expect(() => resolveTrafficRate({ TRAFFIC_RATE: raw }), raw).toThrow(/TRAFFIC_RATE/);
    }
    expect(resolveTrafficRate({ TRAFFIC_RATE: "1000" })).toBe(1000);
  });
});
