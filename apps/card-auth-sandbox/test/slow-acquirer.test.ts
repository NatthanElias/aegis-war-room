import type { SandboxAcquirerTelemetry } from "@warroom/contracts";
import { afterEach, describe, expect, test } from "vitest";
import { createHarness, getJson, sleep } from "./support.ts";

const harness = createHarness();
afterEach(() => harness.cleanup());

const VISA = "4111111111111111";
const MASTERCARD = "5555555555554444";

describe("slow acquirer", () => {
  test("latency rises on acquirer-beta only", async () => {
    const db = await harness.migratedDatabase();
    const sandbox = await harness.sandbox(db);
    sandbox.setAcquirerDelay("acquirer-beta", 2000);

    await Promise.all([
      ...[1000, 2000, 3000].map((cents) => sandbox.authorize(VISA, cents)),
      ...[1000, 2000, 3000].map((cents) => sandbox.authorize(MASTERCARD, cents)),
    ]);
    const response = await getJson(sandbox, "/telemetry/acquirers?windowSec=60");

    expect(response.status).toBe(200);
    const { acquirers } = response.body as SandboxAcquirerTelemetry;
    expect(acquirers["acquirer-beta"].approved).toBe(3);
    expect(acquirers["acquirer-alpha"].approved).toBe(3);
    expect(acquirers["acquirer-beta"].latencyMs?.p50).toBeGreaterThanOrEqual(2000);
    expect(acquirers["acquirer-alpha"].latencyMs?.p95).toBeLessThan(500);
  });

  test("in-flight rises on acquirer-beta only", async () => {
    const db = await harness.migratedDatabase();
    const sandbox = await harness.sandbox(db);
    sandbox.setAcquirerDelay("acquirer-beta", 3000);

    const started = [MASTERCARD, MASTERCARD, VISA].map((pan) => sandbox.authorize(pan, 1000));
    for (const authorization of started) authorization.catch(() => undefined);
    await sleep(1500);
    const response = await getJson(sandbox, "/telemetry/acquirers?windowSec=60");

    expect(response.status).toBe(200);
    const { acquirers } = response.body as SandboxAcquirerTelemetry;
    // Both Mastercard calls are still inside the 3000 ms delay at 1500 ms.
    expect(acquirers["acquirer-beta"].inFlight).toBe(2);
    expect(acquirers["acquirer-beta"].oldestInFlightMs).toBeGreaterThanOrEqual(1000);
    const alphaOldest = acquirers["acquirer-alpha"].oldestInFlightMs;
    expect(alphaOldest === null || alphaOldest < 500).toBe(true);
    expect(acquirers["acquirer-alpha"].inFlight).toBe(0);
    expect(acquirers["acquirer-alpha"].approved).toBe(1);
  });
});
