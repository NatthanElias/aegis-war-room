import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AlertSchema } from "@warroom/contracts";
import Value from "typebox/value";
import { describe, expect, test } from "vitest";
import { InvalidAlertError } from "../src/alerts/adapter.ts";
import { grafanaAdapter } from "../src/alerts/grafana.ts";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8"));

const item = (overrides: Record<string, unknown> = {}) => ({
  status: "firing",
  fingerprint: "fp-1",
  startsAt: "2026-10-28T12:00:00Z",
  labels: { alertname: "High memory usage" },
  ...overrides,
});

function rejection(body: unknown): InvalidAlertError {
  try {
    grafanaAdapter.parse(body);
  } catch (error) {
    if (error instanceof InvalidAlertError) return error;
    throw error;
  }
  throw new Error("parse accepted a body that must be rejected");
}

describe("grafana adapter", () => {
  test("maps the documented body", () => {
    const alerts = grafanaAdapter.parse(fixture("grafana-firing.json"));

    // Context: the literals below were read by hand from grafana-firing.json, the example in Grafana's documentation.
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toMatchObject({
      source: "grafana",
      fingerprint: "c6eadffa33fcdf37",
      startedAt: "2021-10-12T09:51:03.157076+02:00",
      title: "High memory usage",
      status: "firing",
      summary: "This alert was triggered for zone us-1",
      url: "https://play.grafana.org/alerting/1afz29v7z/edit",
      labels: { alertname: "High memory usage", team: "blue", zone: "us-1" },
    });
    expect(alerts[1]).toMatchObject({
      source: "grafana",
      fingerprint: "bc97ff14869b13e3",
      startedAt: "2021-10-12T09:56:03.157076+02:00",
      title: "High CPU usage",
      summary: "This alert was triggered for zone eu-1",
      url: "https://play.grafana.org/alerting/d1rdpdv7k/edit",
    });
    for (const alert of alerts) expect(Value.Check(AlertSchema, alert)).toBe(true);
  });

  test("fills and cuts fields", () => {
    const longName = "abcdefghij".repeat(30);
    // Why: inserted in descending order with zero-padded names, so an unsorted cut keeps k40 and not k01.
    const forty = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`k${String(40 - i).padStart(2, "0")}`, "v"]),
    );

    const [fallback, longTitle, manyLabels] = grafanaAdapter.parse({
      alerts: [
        item({ labels: { team: "blue" }, annotations: { description: "disk is full" } }),
        item({ labels: { alertname: longName } }),
        item({ labels: forty }),
      ],
    });

    expect(fallback?.title).toBe("Grafana alert");
    expect(fallback?.summary).toBe("disk is full");
    expect(longTitle?.title).toHaveLength(200);
    expect(longTitle?.title).toBe("abcdefghij".repeat(20));
    expect(Object.keys(manyLabels?.labels ?? {})).toEqual(
      Array.from({ length: 32 }, (_, i) => `k${String(i + 1).padStart(2, "0")}`),
    );
  });

  test("prefers the summary and cuts long values", () => {
    const [alert] = grafanaAdapter.parse({
      alerts: [
        item({
          labels: { alertname: "A", severity: "critical", note: "n".repeat(300) },
          annotations: { summary: "the summary", description: "the description" },
        }),
      ],
    });

    expect(alert?.summary).toBe("the summary");
    expect(alert?.severity).toBe("critical");
    expect(alert?.labels?.note).toBe("n".repeat(256));
  });

  test("drops a generatorURL that is not a URI", () => {
    const [empty, junk] = grafanaAdapter.parse({
      alerts: [item({ generatorURL: "" }), item({ generatorURL: "not a url" })],
    });

    expect(empty).toBeDefined();
    expect(empty).not.toHaveProperty("url");
    expect(junk).not.toHaveProperty("url");
  });

  test("rejects invalid bodies", () => {
    const rows: Array<[string, unknown, string]> = [
      ["no alerts", {}, "/alerts"],
      ["empty alerts", { alerts: [] }, "/alerts"],
      ["101 items", { alerts: Array.from({ length: 101 }, () => item()) }, "/alerts"],
      ["status pending", { alerts: [item({ status: "pending" })] }, "/alerts/0/status"],
      [
        "no fingerprint",
        { alerts: [(({ fingerprint: _omitted, ...rest }) => rest)(item())] },
        "/alerts/0/fingerprint",
      ],
    ];

    expect(rows).toHaveLength(5);
    // Why: the control shows a body of valid items parses, so each row fails for its own defect.
    expect(grafanaAdapter.parse({ alerts: [item()] })).toHaveLength(1);
    for (const [name, body, field] of rows) {
      const error = rejection(body);
      expect(error.code, name).toBe("invalid_alert");
      expect(error.detail, name).toContain(field);
    }
  });
});
