import { describe, expect, test } from "vitest";
import { createTelemetry } from "../src/telemetry.ts";
import { reportAcquirers } from "../src/telemetry-report.ts";

const fields = (traceId: string, acquirer: "acquirer-alpha" | "acquirer-beta" = "acquirer-alpha") =>
  ({
    traceId,
    brand: acquirer === "acquirer-alpha" ? "visa" : "mastercard",
    acquirer,
    bin: "411111",
    last4: "1111",
    amountCents: 1000,
  }) as const;

describe("telemetry window", () => {
  test("keeps the last 300 s and at most 10,000 entries", () => {
    let now = 1_000_000;
    const telemetry = createTelemetry(() => now);

    telemetry.begin(fields("old"));
    now += 300_000 - 1;
    telemetry.begin(fields("edge"));
    expect(telemetry.entries().map((entry) => entry.traceId)).toEqual(["old", "edge"]);
    now += 2;
    expect(telemetry.entries().map((entry) => entry.traceId)).toEqual(["edge"]);

    for (let i = 0; i < 10_005; i++) telemetry.begin(fields(`n${i}`));
    const kept = telemetry.entries();
    expect(kept).toHaveLength(10_000);
    expect(kept[0]?.traceId).toBe("n5");
    expect(kept[kept.length - 1]?.traceId).toBe("n10004");
  });

  test("an entry that left the window still counts as in flight until it finishes", () => {
    let now = 0;
    const telemetry = createTelemetry(() => now);
    const entry = telemetry.begin(fields("slow"));
    now += 300_001;

    expect(telemetry.entries()).toHaveLength(0);
    expect(telemetry.inFlight).toBe(1);
    telemetry.finish(entry, "ERROR");
    telemetry.finish(entry, "APPROVED");
    expect(telemetry.inFlight).toBe(0);
    expect(entry.status).toBe("ERROR");
  });
});

describe("telemetry report", () => {
  test("computes nearest-rank percentiles and counts only the window", () => {
    let now = 10_000_000;
    const telemetry = createTelemetry(() => now);
    // 100 beta authorizations with latencies 1..100 ms.
    for (let latency = 1; latency <= 100; latency++) {
      const entry = telemetry.begin(fields(`b${latency}`, "acquirer-beta"));
      now += latency;
      telemetry.finish(entry, "APPROVED");
    }
    const pending = telemetry.begin(fields("stuck", "acquirer-beta"));
    now += 300;
    telemetry.begin(fields("newer", "acquirer-beta"));
    now += 400;

    const report = reportAcquirers(telemetry, 300, now);

    expect(report.acquirers["acquirer-beta"]).toMatchObject({
      approved: 100,
      inFlight: 2,
      oldestInFlightMs: 700,
      latencyMs: { p50: 50, p95: 95, max: 100 },
    });
    expect(report.acquirers["acquirer-alpha"]).toMatchObject({ approved: 0, latencyMs: null });
    // A window that starts after every finished entry sees only what started inside it.
    now += 1;
    expect(reportAcquirers(telemetry, 1, now + 3000).acquirers["acquirer-beta"]).toMatchObject({
      approved: 0,
      inFlight: 0,
      oldestInFlightMs: null,
    });
    expect(pending.status).toBe("PENDING");
  });
});
