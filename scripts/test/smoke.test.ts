import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { startServer } from "../../apps/warroom-server/src/server.ts";
import { startFakeSandbox } from "../../test-support/fake-sandbox.ts";
import { runNode } from "../../test-support/process.ts";
import { freePort } from "../../test-support/service.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const smokeScript = join(root, "scripts/smoke.ts");

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("smoke", () => {
  test("root scripts define the four commands and the smoke script spawns no docker", () => {
    const { scripts } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

    expect(scripts.test).toBe("vitest run");
    expect(scripts.typecheck).toBe("tsc --noEmit");
    expect(scripts.lint).toBe("biome check .");
    expect(scripts.smoke).toContain("scripts/smoke.ts");

    const source = readFileSync(smokeScript, "utf8");
    expect(source).not.toMatch(/docker/i);
    expect(source).not.toMatch(/child_process|spawn|exec(Sync|File)?\(/);
  });

  test("names the failing probe when the ports are closed", async () => {
    const warroom = await freePort();
    const sandbox = await freePort();

    const run = await runNode(smokeScript, {
      SMOKE_WARROOM_URL: `http://127.0.0.1:${warroom}`,
      SMOKE_SANDBOX_URL: `http://127.0.0.1:${sandbox}`,
    });

    expect(run.code).toBe(1);
    expect(run.stderr).toContain("FAIL warroom-server /healthz");
    expect(run.stderr).toContain("FAIL card-auth-sandbox /healthz");
    expect(run.stdout).not.toContain("ok ");
  });

  test("names only the sandbox probe when only the sandbox is down", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wr-smoke-"));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    await mkdir(join(dir, "dist"));
    await writeFile(join(dir, "dist", "index.html"), '<div id="root"></div>');
    const sandbox = await startFakeSandbox();
    cleanups.push(() => sandbox.close());
    const server = await startServer({
      port: 0,
      host: "127.0.0.1",
      incidentId: "test-inc",
      incidentsDir: join(dir, "incidents"),
      sandboxUrl: sandbox.url,
      sandboxPollMs: 200,
      webDist: join(dir, "dist"),
    });
    cleanups.push(() => server.close());
    const env = {
      WARROOM_PORT: String(server.port),
      SMOKE_SANDBOX_WAIT_MS: "1500",
    };

    const healthy = await runNode(smokeScript, env);
    expect(healthy.stderr).toBe("");
    expect(healthy.code).toBe(0);
    expect(healthy.stdout).toContain("ok card-auth-sandbox /healthz (via warroom-server)");

    sandbox.setStatus(503);
    await new Promise((resolve) => setTimeout(resolve, 600));
    const degraded = await runNode(smokeScript, env);

    expect(degraded.code).toBe(1);
    expect(degraded.stderr).toContain("FAIL card-auth-sandbox /healthz");
    expect(degraded.stderr).not.toContain("FAIL warroom-server");
    expect(degraded.stdout).toContain("ok warroom-server /healthz");
    expect(degraded.stdout).toContain("ok warroom-server /chord");
  });
});
