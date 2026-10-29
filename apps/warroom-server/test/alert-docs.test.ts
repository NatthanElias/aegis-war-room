import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), "utf8");

/** The text under the `## heading` line, up to the next `## ` heading. */
function section(markdown: string, heading: string): string {
  const start = markdown.search(new RegExp(`^## ${heading}\\s*$`, "m"));
  if (start < 0) throw new Error(`no "## ${heading}" section`);
  const rest = markdown.slice(start).split("\n").slice(1).join("\n");
  const next = rest.search(/^## /m);
  return next < 0 ? rest : rest.slice(0, next);
}

describe("alert docs", () => {
  test("alert docs", () => {
    const env = read(".env.example");
    const webhook = read("docs/alert-webhook.md");
    const reference = read("docs/architecture-reference.md");
    const variables = [
      "OPENROUTER_API_KEY=",
      "WARROOM_MODEL_COORDINATOR=",
      "WARROOM_MODEL_LOGS=",
      "WARROOM_MODEL_DB=",
      "WARROOM_MODEL_DEPLOY=",
      "WARROOM_MODEL_ACQUIRER=",
      "WARROOM_ALERT_TOKEN=",
      "WARROOM_GRAFANA_HMAC_SECRET=",
      "WARROOM_ALERT_RATE_LIMIT=",
    ];
    const webhookTerms = [
      "/alerts/grafana",
      "X-Grafana-Alerting-Signature",
      "X-Grafana-Alerting-Timestamp",
      "webhook_config",
      "Bearer",
    ];
    const statuses = ["202", "200", "400", "401", "404", "405", "413", "415", "429", "503"];
    const referenceTerms = [
      "POST /alerts/grafana",
      "version 3",
      "WARROOM_MODEL_COORDINATOR",
      "WARROOM_MODEL_LOGS",
      "WARROOM_MODEL_DB",
      "WARROOM_MODEL_DEPLOY",
      "WARROOM_MODEL_ACQUIRER",
    ];

    expect(variables).toHaveLength(9);
    for (const variable of variables) {
      expect(env, variable).toMatch(new RegExp(`^${variable}`, "m"));
    }
    for (const term of webhookTerms) expect(webhook, term).toContain(term);
    expect(webhook).toMatch(/^##+ .*adapter/im);
    expect(statuses).toHaveLength(10);
    for (const status of statuses) {
      expect(webhook, status).toMatch(new RegExp(`\`${status}\``));
    }
    for (const term of referenceTerms) expect(reference, term).toContain(term);
  });

  test("security report", () => {
    const security = read("docs/security.md");
    const controls = section(security, "Enforced controls").toLowerCase();
    const gaps = section(security, "Production gaps");
    const controlTerms = [
      "bearer token",
      "constant-time compare",
      "grafana signature",
      "replay window",
      "body limit",
      "rate limit",
      "untrusted marking",
    ];
    const gapTerms = [
      "login",
      "card data",
      "prompt injection",
      "token rotation",
      "spend caps",
      "audit trail",
    ];

    expect(controlTerms).toHaveLength(7);
    for (const term of controlTerms) expect(controls, term).toContain(term);
    const rows = gaps
      .split("\n")
      .filter((line) => line.startsWith("|"))
      .map((line) =>
        line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim()),
      )
      // Skip the header and the `| :--- |` divider.
      .slice(2);
    expect(gapTerms).toHaveLength(6);
    expect(rows).toHaveLength(6);
    for (const term of gapTerms) {
      const row = rows.filter((cells) => (cells[0] ?? "").toLowerCase().includes(term));
      expect(row, term).toHaveLength(1);
      expect(row[0], term).toHaveLength(3);
      for (const cell of row[0] ?? []) expect(cell.length, term).toBeGreaterThan(0);
    }
  });
});
