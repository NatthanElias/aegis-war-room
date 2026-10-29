import { AlertSchema } from "@warroom/contracts";
import Value from "typebox/value";
import { describe, expect, test } from "vitest";

// Why: the base is written out here, not built by the schema, so a wrong schema default cannot make a row pass.
const required = () => ({
  source: "grafana",
  fingerprint: "a1b2",
  title: "High memory usage",
  status: "firing",
  startedAt: "2026-10-28T12:00:00Z",
});

describe("alert contract", () => {
  test("accepts valid alerts", () => {
    const full = {
      ...required(),
      severity: "critical",
      summary: "Memory is above 90 percent",
      url: "https://grafana.example/alerting/1afz29v7z/edit",
      labels: { alertname: "High memory usage", team: "blue" },
    };

    expect(Value.Check(AlertSchema, required())).toBe(true);
    expect(Value.Check(AlertSchema, full)).toBe(true);
  });

  test("rejects invalid alerts", () => {
    const rows: Array<[string, unknown]> = [
      ["empty title", { ...required(), title: "" }],
      ["201-character title", { ...required(), title: "x".repeat(201) }],
      ["no fingerprint", (({ fingerprint: _omitted, ...rest }) => rest)(required())],
      ["status pending", { ...required(), status: "pending" }],
      ["startedAt yesterday", { ...required(), startedAt: "yesterday" }],
      ["source Grafana Cloud", { ...required(), source: "Grafana Cloud" }],
      [
        "33 labels",
        {
          ...required(),
          labels: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, "v"])),
        },
      ],
      ["url not a url", { ...required(), url: "not a url" }],
    ];

    expect(rows).toHaveLength(8);
    // Why: the control proves the base is valid, so each row below fails for its own change and not for a broken base.
    expect(Value.Check(AlertSchema, required())).toBe(true);
    for (const [name, alert] of rows) {
      expect(Value.Check(AlertSchema, alert), name).toBe(false);
    }
  });
});
