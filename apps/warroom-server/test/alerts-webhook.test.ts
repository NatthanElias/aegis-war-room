import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import {
  type AlertTestServer,
  grafanaAlert,
  grafanaBody,
  startAlertServer,
} from "../../../test-support/alert-server.ts";
import { MAX_BODY_BYTES } from "../src/alerts/index.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function start(settings?: Parameters<typeof startAlertServer>[0]): Promise<AlertTestServer> {
  const alertServer = await startAlertServer(settings);
  cleanups.push(() => alertServer.close());
  return alertServer;
}

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

describe("alert webhook", () => {
  test("accepts a firing alert", async () => {
    const { post, alerts } = await start();
    const before = Date.now();

    const response = await post(grafanaBody(grafanaAlert("a1b2")));
    const after = Date.now();

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      alerts: [{ alertId: "AL-01", fingerprint: "a1b2", status: "accepted" }],
    });
    const stored = (await alerts())["AL-01"];
    expect(stored).toMatchObject({
      id: "AL-01",
      status: "firing",
      source: "grafana",
      fingerprint: "a1b2",
      title: "Alert a1b2",
      severity: "critical",
      summary: "Summary of a1b2",
      labels: { alertname: "Alert a1b2", severity: "critical" },
      startedAt: "2026-10-28T12:00:00Z",
    });
    const receivedAt = Date.parse(stored?.receivedAt ?? "");
    expect(receivedAt).toBeGreaterThanOrEqual(before - 5000);
    expect(receivedAt).toBeLessThanOrEqual(after + 5000);
    expect(stored).not.toHaveProperty("resolvedAt");
  });

  test("maps a batch in order", async () => {
    const { post, alerts } = await start();
    await post(grafanaBody(grafanaAlert("first")));

    const response = await post(
      grafanaBody(grafanaAlert("x"), grafanaAlert("first"), grafanaAlert("y")),
    );

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      alerts: [
        { alertId: "AL-02", fingerprint: "x", status: "accepted" },
        { alertId: "AL-01", fingerprint: "first", status: "duplicate" },
        { alertId: "AL-03", fingerprint: "y", status: "accepted" },
      ],
    });
    expect(Object.keys(await alerts())).toEqual(["AL-01", "AL-02", "AL-03"]);
  });

  test("repeat is a duplicate", async () => {
    const { post, alerts } = await start();
    await post(grafanaBody(grafanaAlert("a1b2")));

    const response = await post(grafanaBody(grafanaAlert("a1b2")));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      alerts: [{ alertId: "AL-01", fingerprint: "a1b2", status: "duplicate" }],
    });
    expect(Object.keys(await alerts())).toEqual(["AL-01"]);
  });

  test("two identical alerts in one body are one alert", async () => {
    const { post, alerts } = await start();

    const response = await post(grafanaBody(grafanaAlert("same"), grafanaAlert("same")));

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      alerts: [
        { alertId: "AL-01", fingerprint: "same", status: "accepted" },
        { alertId: "AL-01", fingerprint: "same", status: "duplicate" },
      ],
    });
    expect(Object.keys(await alerts())).toEqual(["AL-01"]);
  });

  test("resolves and ignores", async () => {
    const { post, alerts } = await start();
    await post(grafanaBody(grafanaAlert("a1b2")));

    const resolved = await post(grafanaBody(grafanaAlert("a1b2", { status: "resolved" })));
    const ignored = await post(grafanaBody(grafanaAlert("never-seen", { status: "resolved" })));

    expect(resolved.status).toBe(200);
    expect(resolved.body).toEqual({
      alerts: [{ alertId: "AL-01", fingerprint: "a1b2", status: "resolved" }],
    });
    const stored = await alerts();
    expect(stored["AL-01"]?.status).toBe("resolved");
    expect(typeof stored["AL-01"]?.resolvedAt).toBe("string");
    expect(Number.isNaN(Date.parse(stored["AL-01"]?.resolvedAt ?? ""))).toBe(false);
    expect(ignored.status).toBe(200);
    expect(ignored.body).toEqual({ alerts: [{ fingerprint: "never-seen", status: "ignored" }] });
    expect(Object.keys(stored)).toEqual(["AL-01"]);
  });

  test("re-fire is a new alert", async () => {
    const { post, alerts } = await start();
    await post(grafanaBody(grafanaAlert("a1b2")));
    await post(grafanaBody(grafanaAlert("a1b2", { status: "resolved" })));

    const response = await post(grafanaBody(grafanaAlert("a1b2")));

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      alerts: [{ alertId: "AL-02", fingerprint: "a1b2", status: "accepted" }],
    });
    const stored = await alerts();
    expect(stored["AL-01"]?.status).toBe("resolved");
    expect(stored["AL-02"]?.status).toBe("firing");
  });

  test("accepts an Alertmanager body", async () => {
    const { post, alerts } = await start();

    const response = await post(fixture("alertmanager-firing.json"));

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      alerts: [
        { alertId: "AL-01", fingerprint: "3a1f9c0d7be24e65", status: "accepted" },
        { alertId: "AL-02", fingerprint: "9d84b2e1c05a7f31", status: "accepted" },
      ],
    });
    // Context: the literals were read by hand from alertmanager-firing.json.
    const stored = await alerts();
    expect(stored["AL-01"]).toMatchObject({
      fingerprint: "3a1f9c0d7be24e65",
      title: "HighPoolUsage",
      startedAt: "2026-10-28T12:00:00.000Z",
      source: "grafana",
    });
    expect(stored["AL-02"]).toMatchObject({
      fingerprint: "9d84b2e1c05a7f31",
      title: "SlowAcquirer",
      startedAt: "2026-10-28T12:00:30.000Z",
      summary: "acquirer-beta p95 above 5 s",
    });
  });

  test("rejects bad tokens", async () => {
    const { post, alerts } = await start();
    const body = grafanaBody(grafanaAlert("a1b2"));
    const rows: Array<[string, string | null]> = [
      ["no Authorization", null],
      ["Bearer wrong", "Bearer wrong"],
      ["Basic scheme", "Basic dGVzdA=="],
      // Hazard: a prefix or an extension of the real token must fail, as a startsWith comparison would pass them.
      ["token prefix", "Bearer test-toke"],
      ["token with suffix", "Bearer test-token-extra"],
    ];

    expect(rows).toHaveLength(5);
    for (const [name, authorization] of rows) {
      const response = await post(body, { authorization });
      expect(response.status, name).toBe(401);
      expect(response.body, name).toEqual({ error: "unauthorized" });
      expect(response.headers.get("www-authenticate"), name).toBe("Bearer");
    }
    expect(await alerts()).toEqual({});
    // Control: the same body with the right token is accepted, so the rows above failed on the token alone.
    expect((await post(body)).status).toBe(202);
  });

  test("disabled without a token", async () => {
    for (const settings of [{}, { token: "" }]) {
      const { post } = await start(settings);

      const response = await post(grafanaBody(grafanaAlert("a1b2")), {
        authorization: "Bearer test-token",
      });
      const get = await post("", { method: "GET" });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: "alerts_disabled" });
      expect(get.status).toBe(503);
    }
  });

  test("rejects bad requests", async () => {
    const { post, alerts } = await start();
    const padded = (bytes: number) => {
      const base = JSON.stringify({ alerts: [grafanaAlert("big")], pad: "" });
      return JSON.stringify({
        alerts: [grafanaAlert("big")],
        pad: "x".repeat(bytes - base.length),
      });
    };

    const notJson = await post("{not json");
    const noAlerts = await post({ other: 1 });
    const tooLarge = await post(padded(MAX_BODY_BYTES + 1));
    const plain = await post(grafanaBody(grafanaAlert("a1b2")), {
      headers: { "content-type": "text/plain" },
    });

    expect(notJson.status).toBe(400);
    expect(notJson.body).toMatchObject({ error: "invalid_alert" });
    expect(typeof (notJson.body as { detail: unknown }).detail).toBe("string");
    expect(noAlerts.status).toBe(400);
    expect((noAlerts.body as { error: string; detail: string }).error).toBe("invalid_alert");
    expect((noAlerts.body as { detail: string }).detail).toContain("/alerts");
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body).toEqual({ error: "payload_too_large" });
    expect(plain.status).toBe(415);
    expect(plain.body).toEqual({ error: "unsupported_media_type" });
    expect(await alerts()).toEqual({});
    // Control: a body of exactly the limit is read and stored, so 413 above is about the extra byte.
    const atLimit = padded(MAX_BODY_BYTES);
    expect(Buffer.byteLength(atLimit)).toBe(MAX_BODY_BYTES);
    expect((await post(atLimit)).status).toBe(202);
  });

  test("unknown source and methods", async () => {
    const { post, server } = await start();

    const unknown = await post(grafanaBody(grafanaAlert("a1b2")), { path: "/alerts/datadog" });
    const inherited = await post(grafanaBody(grafanaAlert("a1b2")), {
      path: "/alerts/constructor",
    });
    const methods = [];
    for (const method of ["GET", "PUT", "DELETE"]) {
      methods.push(await post("{}", { method }));
    }
    const health = await fetch(`http://127.0.0.1:${server.port}/healthz`);

    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: "unknown_source" });
    expect(inherited.status).toBe(404);
    expect(methods).toHaveLength(3);
    for (const response of methods) {
      expect(response.status).toBe(405);
      expect(response.body).toEqual({ error: "method_not_allowed" });
      expect(response.headers.get("allow")).toBe("POST");
    }
    expect(health.status).toBe(200);
  });

  test("concurrent identical alerts", async () => {
    const { post, alerts } = await start();

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => post(grafanaBody(grafanaAlert("a1b2")))),
    );

    expect(responses.filter((response) => response.status === 202)).toHaveLength(1);
    const duplicates = responses.filter((response) => response.status === 200);
    expect(duplicates).toHaveLength(9);
    for (const response of responses) {
      const entries = (response.body as { alerts: Array<{ alertId: string; status: string }> })
        .alerts;
      expect(entries).toHaveLength(1);
      expect(entries[0]?.alertId).toBe("AL-01");
    }
    for (const response of duplicates) {
      expect((response.body as { alerts: Array<{ status: string }> }).alerts[0]?.status).toBe(
        "duplicate",
      );
    }
    expect(Object.keys(await alerts())).toEqual(["AL-01"]);
  });
});
