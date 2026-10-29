// Check that a real, pinned Grafana can deliver a signed notification to warroom-server.
// It starts the server on a free port with a bearer token and an HMAC secret, starts Grafana in Docker with the
// provisioning files in scripts/grafana/, waits up to 90 s for the alert to be recorded, and removes the container.
// Needs Docker. On Linux the container shares the host network, so the server stays on 127.0.0.1.
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { startServer } from "../apps/warroom-server/src/server.ts";
import { createFauxModels } from "../test-support/faux-models.ts";

/** Context: HMAC signing on webhook contact points exists from Grafana 12.0; this exact tag is the one verified. */
const GRAFANA_IMAGE = "grafana/grafana:12.4.14";
const ALERT_TITLE = "WarroomGrafanaCheck";
const WAIT_MS = 90_000;

const run = promisify(execFile);
const provisioning = fileURLToPath(new URL("./grafana/provisioning/alerting", import.meta.url));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function docker(args: string[], env: Record<string, string> = {}): Promise<string> {
  const { stdout } = await run("docker", args, { env: { ...process.env, ...env } });
  return stdout.trim();
}

async function ensureImage(): Promise<void> {
  try {
    await docker(["image", "inspect", GRAFANA_IMAGE]);
  } catch {
    console.log(`pulling ${GRAFANA_IMAGE}`);
    await new Promise<void>((resolve, reject) => {
      const pull = spawn("docker", ["pull", GRAFANA_IMAGE], { stdio: "inherit" });
      pull.on("error", reject);
      pull.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`docker pull exited ${code}`)),
      );
    });
  }
}

const container = `warroom-check-grafana-${process.pid}`;
// Hazard: Grafana expands ${VAR} in the provisioning file and then parses the result as YAML, so a value such as
// "t" or "12e5" would become a boolean or a number. The prefix keeps both secrets plain strings.
const token = `check-${randomBytes(16).toString("hex")}`;
const hmacSecret = `check-${randomBytes(16).toString("hex")}`;
const refusals: string[] = [];
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  refusals.push(args.join(" "));
  originalWarn(...args);
};

let server: Awaited<ReturnType<typeof startServer>> | undefined;
let incidentsDir: string | undefined;
let finished = false;

async function cleanup(): Promise<void> {
  if (finished) return;
  finished = true;
  await docker(["rm", "-f", container]).catch(() => undefined);
  await server?.close().catch(() => undefined);
  if (incidentsDir) await rm(incidentsDir, { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void cleanup().then(() => process.exit(130));
  });
}

async function main(): Promise<boolean> {
  await ensureImage();
  incidentsDir = await mkdtemp(join(tmpdir(), "wr-grafana-check-"));
  const linux = process.platform === "linux";
  const faux = createFauxModels();
  server = await startServer({
    port: 0,
    // Hazard: off Linux the container reaches the host through the gateway, so the server must listen on every
    // interface for the duration of the check; on Linux the shared host network keeps it on loopback.
    host: linux ? "127.0.0.1" : "0.0.0.0",
    incidentId: "grafana-check",
    incidentsDir,
    sandboxUrl: "http://127.0.0.1:1",
    alerts: { token, hmacSecret },
    agents: { models: faux.models, agentModels: faux.agentModels },
  });
  const hostName = linux ? "127.0.0.1" : "host.docker.internal";
  const alertUrl = `http://${hostName}:${server.port}/alerts/grafana`;

  const grafanaPort = await freePort();
  await docker(
    [
      "run",
      "-d",
      "--name",
      container,
      ...(linux ? ["--network", "host"] : ["--add-host", "host.docker.internal:host-gateway"]),
      "-e",
      "WARROOM_ALERT_URL",
      "-e",
      "WARROOM_ALERT_TOKEN",
      "-e",
      "WARROOM_GRAFANA_HMAC_SECRET",
      "-e",
      `GF_SERVER_HTTP_PORT=${grafanaPort}`,
      "-e",
      "GF_ANALYTICS_REPORTING_ENABLED=false",
      "-e",
      "GF_ANALYTICS_CHECK_FOR_UPDATES=false",
      "-e",
      "GF_PLUGINS_PREINSTALL_DISABLED=true",
      // Why: Grafana loads provisioned contact points and policies into its Alertmanager on this poll, 60 s by
      // default, and the first notification waits for it.
      "-e",
      "GF_UNIFIED_ALERTING_ALERTMANAGER_CONFIG_POLL_INTERVAL=5s",
      "-v",
      `${provisioning}:/etc/grafana/provisioning/alerting:ro`,
      GRAFANA_IMAGE,
    ],
    {
      WARROOM_ALERT_URL: alertUrl,
      WARROOM_ALERT_TOKEN: token,
      WARROOM_GRAFANA_HMAC_SECRET: hmacSecret,
    },
  );
  console.log(`grafana ${GRAFANA_IMAGE} on :${grafanaPort} posting to ${alertUrl}`);

  const startedAt = Date.now();
  const deadline = startedAt + WAIT_MS;
  while (Date.now() < deadline) {
    const { alerts } = await server.store.readIncident();
    const found = Object.values(alerts).find(
      (alert) => alert.source === "grafana" && alert.title === ALERT_TITLE,
    );
    if (found) {
      console.log(
        `recorded ${found.id} "${found.title}" fingerprint ${found.fingerprint} after ${Math.round((Date.now() - startedAt) / 1000)} s`,
      );
      return true;
    }
    await sleep(1000);
  }
  console.error(`no alert from Grafana within ${WAIT_MS / 1000} s`);
  console.error(`refusals logged by the war room:\n${refusals.join("\n") || "(none)"}`);
  console.error(
    await docker(["logs", "--tail", "40", container]).catch(() => "(no container log)"),
  );
  return false;
}

let ok = false;
try {
  ok = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  await cleanup();
}
if (ok) console.log("grafana check ok");
process.exit(ok ? 0 : 1);
