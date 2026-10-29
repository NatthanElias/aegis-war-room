import { afterEach, beforeEach, describe, expect, type MockInstance, test, vi } from "vitest";
import {
  ALERT_TOKEN,
  type AlertTestServer,
  grafanaAlert,
  grafanaBody,
  HMAC_SECRET,
  sign,
  startAlertServer,
} from "../../../test-support/alert-server.ts";

const cleanups: Array<() => Promise<void>> = [];
let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(async () => {
  warn.mockRestore();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** Epoch seconds 1,800,000,000 expressed in milliseconds; the server's clock for the signature tests. */
const NOW_SECONDS = 1_800_000_000;

async function start(settings: Parameters<typeof startAlertServer>[0]): Promise<AlertTestServer> {
  const alertServer = await startAlertServer(settings);
  cleanups.push(() => alertServer.close());
  return alertServer;
}

const warned = () => warn.mock.calls.map((call) => call.join(" ")).join("\n");

describe("grafana signature", () => {
  const settings = () => ({
    token: ALERT_TOKEN,
    hmacSecret: HMAC_SECRET,
    now: () => NOW_SECONDS * 1000,
  });
  const body = grafanaBody(grafanaAlert("a1b2"));
  const raw = JSON.stringify(body);
  const headers = (timestamp: number, signature: string) => ({
    "x-grafana-alerting-timestamp": String(timestamp),
    "x-grafana-alerting-signature": signature,
  });

  test("accepts a signed request", async () => {
    const { post } = await start(settings());

    const response = await post(raw, {
      headers: headers(NOW_SECONDS, sign(HMAC_SECRET, String(NOW_SECONDS), raw)),
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      alerts: [{ alertId: "AL-01", fingerprint: "a1b2", status: "accepted" }],
    });
  });

  test("rejects bad signatures", async () => {
    const { post, alerts } = await start(settings());
    const fresh = String(NOW_SECONDS);
    const rows: Array<{ name: string; headers: Record<string, string>; reason: string }> = [
      {
        name: "no signature header",
        headers: { "x-grafana-alerting-timestamp": fresh },
        reason: "missing_signature",
      },
      {
        name: "signature of another body",
        headers: headers(NOW_SECONDS, sign(HMAC_SECRET, fresh, `${raw} `)),
        reason: "bad_signature",
      },
      {
        name: "signature made with another secret",
        headers: headers(NOW_SECONDS, sign("other-secret", fresh, raw)),
        reason: "bad_signature",
      },
      {
        name: "timestamp 301 s old",
        headers: headers(NOW_SECONDS - 301, sign(HMAC_SECRET, String(NOW_SECONDS - 301), raw)),
        reason: "stale_timestamp",
      },
      {
        name: "timestamp 301 s ahead",
        headers: headers(NOW_SECONDS + 301, sign(HMAC_SECRET, String(NOW_SECONDS + 301), raw)),
        reason: "stale_timestamp",
      },
      {
        name: "no timestamp header",
        headers: { "x-grafana-alerting-signature": sign(HMAC_SECRET, "", raw) },
        reason: "missing_timestamp",
      },
      {
        name: "timestamp that is not seconds",
        headers: {
          "x-grafana-alerting-timestamp": "12abc",
          "x-grafana-alerting-signature": sign(HMAC_SECRET, "12abc", raw),
        },
        reason: "bad_timestamp",
      },
      {
        name: "signature that is not hex",
        headers: headers(NOW_SECONDS, "not-a-signature"),
        reason: "bad_signature",
      },
    ];

    expect(rows).toHaveLength(8);
    for (const row of rows) {
      warn.mockClear();
      const response = await post(raw, { headers: row.headers });
      expect(response.status, row.name).toBe(401);
      expect(response.body, row.name).toEqual({ error: "unauthorized" });
      expect(warned(), row.name).toContain(row.reason);
    }
    expect(await alerts()).toEqual({});
    // Control: 299 s old with a valid signature is inside the window.
    const inside = await post(raw, {
      headers: headers(NOW_SECONDS - 299, sign(HMAC_SECRET, String(NOW_SECONDS - 299), raw)),
    });
    expect(inside.status).toBe(202);
  });

  test("the window includes 300 s on both sides", async () => {
    const { post } = await start(settings());
    const past = await post(JSON.stringify(grafanaBody(grafanaAlert("p"))), {
      headers: headers(
        NOW_SECONDS - 300,
        sign(
          HMAC_SECRET,
          String(NOW_SECONDS - 300),
          JSON.stringify(grafanaBody(grafanaAlert("p"))),
        ),
      ),
    });
    const future = await post(JSON.stringify(grafanaBody(grafanaAlert("f"))), {
      headers: headers(
        NOW_SECONDS + 300,
        sign(
          HMAC_SECRET,
          String(NOW_SECONDS + 300),
          JSON.stringify(grafanaBody(grafanaAlert("f"))),
        ),
      ),
    });

    expect(past.status).toBe(202);
    expect(future.status).toBe(202);
  });

  test("a valid signature does not replace the token", async () => {
    const { post, alerts } = await start(settings());

    const response = await post(raw, {
      authorization: null,
      headers: headers(NOW_SECONDS, sign(HMAC_SECRET, String(NOW_SECONDS), raw)),
    });

    expect(response.status).toBe(401);
    expect(warned()).toContain("missing_token");
    expect(await alerts()).toEqual({});
  });
});

describe("rate limit", () => {
  const clock = (start: number) => {
    let current = start;
    return { now: () => current, set: (value: number) => (current = value) };
  };
  const T0 = 1_800_000_000_000;

  test("limits new alerts", async () => {
    const time = clock(T0);
    const { post, alerts } = await start({ token: ALERT_TOKEN, rateLimit: 3, now: time.now });
    for (const fingerprint of ["a", "b", "c"]) {
      expect((await post(grafanaBody(grafanaAlert(fingerprint)))).status).toBe(202);
    }

    time.set(T0 + 10_000);
    const limited = await post(grafanaBody(grafanaAlert("d")));
    const duplicate = await post(grafanaBody(grafanaAlert("a")));
    const resolution = await post(grafanaBody(grafanaAlert("b", { status: "resolved" })));

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: "rate_limited" });
    // Context: the oldest counted alert is 10 s old, so its slot frees in 60 - 10 = 50 s.
    expect(limited.headers.get("retry-after")).toBe("50");
    expect(Object.keys(await alerts())).toEqual(["AL-01", "AL-02", "AL-03"]);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toEqual({
      alerts: [{ alertId: "AL-01", fingerprint: "a", status: "duplicate" }],
    });
    expect(resolution.status).toBe(200);
    expect(resolution.body).toEqual({
      alerts: [{ alertId: "AL-02", fingerprint: "b", status: "resolved" }],
    });
  });

  test("batch over the limit and the window", async () => {
    const time = clock(T0);
    const { post, alerts } = await start({ token: ALERT_TOKEN, rateLimit: 3, now: time.now });
    await post(grafanaBody(grafanaAlert("a"), grafanaAlert("b")));

    const over = await post(grafanaBody(grafanaAlert("c"), grafanaAlert("d")));

    expect(over.status).toBe(429);
    expect(Object.keys(await alerts())).toEqual(["AL-01", "AL-02"]);
    // Why: the rejected request must not have used slots, so one more alert still fits in the same window.
    const fitting = await post(grafanaBody(grafanaAlert("c")));
    expect(fitting.status).toBe(202);
    time.set(T0 + 61_000);
    const later = await post(grafanaBody(grafanaAlert("d")));
    expect(later.status).toBe(202);
    expect(Object.keys(await alerts())).toEqual(["AL-01", "AL-02", "AL-03", "AL-04"]);
  });

  test("a slot frees at 60 s and not before", async () => {
    const time = clock(T0);
    const { post } = await start({ token: ALERT_TOKEN, rateLimit: 1, now: time.now });
    await post(grafanaBody(grafanaAlert("a")));

    time.set(T0 + 59_999);
    const before = await post(grafanaBody(grafanaAlert("b")));
    time.set(T0 + 60_000);
    const at = await post(grafanaBody(grafanaAlert("b")));

    expect(before.status).toBe(429);
    expect(before.headers.get("retry-after")).toBe("1");
    expect(at.status).toBe(202);
  });
});
