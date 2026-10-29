import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterEach, describe, expect, test } from "vitest";
import { sign } from "../../../test-support/alert-server.ts";
import { createTestDatabase } from "../../../test-support/database.ts";
import { repoRoot, runNode } from "../../../test-support/process.ts";
import { freePort, sleep } from "../../../test-support/service.ts";
import { runMigrations } from "../../card-auth-sandbox/src/migrations.ts";

const mainScript = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const migrationsDir = fileURLToPath(new URL("../../card-auth-sandbox/migrations", import.meta.url));

/** A startup that must fail does so within a second; a process alive after this long is the fault. */
const EXIT_TIMEOUT_MS = 8000;

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** Every variable the server reads is set, so nothing from the machine running the test leaks in. */
const cleanEnv = (): Record<string, string> => ({
  OPENROUTER_API_KEY: "",
  WARROOM_MODEL_COORDINATOR: "",
  WARROOM_MODEL_LOGS: "",
  WARROOM_MODEL_DB: "",
  WARROOM_MODEL_DEPLOY: "",
  WARROOM_MODEL_ACQUIRER: "",
  WARROOM_ALERT_TOKEN: "",
  WARROOM_GRAFANA_HMAC_SECRET: "",
  WARROOM_ALERT_RATE_LIMIT: "",
});

interface Main {
  readonly port: number;
  readonly child: ChildProcess;
  output(): string;
}

/** Starts `main.ts` as compose does, on a migrated test database, and waits until `/healthz` answers 200. */
async function startMain(overrides: Record<string, string>): Promise<Main> {
  const db = await createTestDatabase();
  cleanups.push(() => db.drop());
  const admin = new pg.Client({ connectionString: db.url });
  await admin.connect();
  try {
    await runMigrations(admin, migrationsDir);
  } finally {
    await admin.end();
  }
  const incidentsDir = await mkdtemp(join(tmpdir(), "wr-startup-"));
  cleanups.push(() => rm(incidentsDir, { recursive: true, force: true }));
  const port = await freePort();
  const child = spawn(process.execPath, [mainScript], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...cleanEnv(),
      DATABASE_URL: db.roleUrl("warroom_diag"),
      INCIDENTS_DIR: incidentsDir,
      INCIDENT_ID: "test-inc",
      SANDBOX_URL: "http://127.0.0.1:1",
      PORT: String(port),
      ...overrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    output += chunk;
  });
  cleanups.push(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await exited;
  });
  const deadline = Date.now() + 15_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`main.ts exited early:\n${output}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/healthz`)).status === 200) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error(`main.ts never answered /healthz 200:\n${output}`);
    await sleep(100);
  }
  return { port, child, output: () => output };
}

const alertBody = (fingerprint: string) =>
  JSON.stringify({
    alerts: [
      {
        status: "firing",
        fingerprint,
        startsAt: "2026-10-28T12:00:00Z",
        labels: { alertname: `Alert ${fingerprint}` },
      },
    ],
  });

describe("warroom-server startup", () => {
  test("startup with and without models", async () => {
    const main = await startMain({});
    const health = await fetch(`http://127.0.0.1:${main.port}/healthz`);

    expect(health.status).toBe(200);
    expect(main.output()).toContain("Coordinator offline: OPENROUTER_API_KEY is not set");

    const failed = await runNode(
      mainScript,
      {
        ...cleanEnv(),
        PORT: "0",
        DATABASE_URL: "postgres://warroom_diag:warroom_diag@127.0.0.1:1/none",
        WARROOM_MODEL_COORDINATOR: "anthropic/claude-nope",
      },
      EXIT_TIMEOUT_MS,
    );

    expect(failed.code).not.toBe(0);
    expect(failed.code).not.toBeNull();
    expect(failed.stderr).toContain("unknown model anthropic/claude-nope");
  });

  test("a key silences the offline notice", async () => {
    const main = await startMain({ OPENROUTER_API_KEY: "not-a-real-key" });

    expect(main.output()).not.toContain("Coordinator offline");
  });

  test("an unusable rate limit stops startup", async () => {
    const rows = ["0", "abc", "2.5"];

    expect(rows).toHaveLength(3);
    for (const value of rows) {
      const failed = await runNode(
        mainScript,
        {
          ...cleanEnv(),
          PORT: "0",
          DATABASE_URL: "postgres://warroom_diag:warroom_diag@127.0.0.1:1/none",
          WARROOM_ALERT_RATE_LIMIT: value,
        },
        EXIT_TIMEOUT_MS,
      );
      expect(failed.code, value).toBe(1);
      expect(failed.stderr, value).toContain("WARROOM_ALERT_RATE_LIMIT");
    }
  });

  test("main reads the alert settings from the environment", async () => {
    const main = await startMain({
      WARROOM_ALERT_TOKEN: "child-token",
      WARROOM_GRAFANA_HMAC_SECRET: "child-secret",
      WARROOM_ALERT_RATE_LIMIT: "1",
    });
    const post = (body: string, headers: Record<string, string> = {}, token = "child-token") =>
      fetch(`http://127.0.0.1:${main.port}/alerts/grafana`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          ...headers,
        },
        body,
      });
    const signed = (body: string) => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      return {
        "x-grafana-alerting-timestamp": timestamp,
        "x-grafana-alerting-signature": sign("child-secret", timestamp, body),
      };
    };
    const first = alertBody("one");
    const second = alertBody("two");

    const unsigned = await post(first);
    const wrongToken = await post(first, signed(first), "other-token");
    const accepted = await post(first, signed(first));
    const limited = await post(second, signed(second));

    expect(unsigned.status).toBe(401);
    expect(wrongToken.status).toBe(401);
    expect(accepted.status).toBe(202);
    expect(limited.status).toBe(429);
  });

  test("without a token the webhooks are disabled", async () => {
    const main = await startMain({});

    const response = await fetch(`http://127.0.0.1:${main.port}/alerts/grafana`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer anything" },
      body: alertBody("one"),
    });

    expect(response.status).toBe(503);
    expect(main.output()).toContain("Alert webhooks disabled");
  });
});
