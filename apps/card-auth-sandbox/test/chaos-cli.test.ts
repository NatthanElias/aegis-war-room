import { spawn } from "node:child_process";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { repoRoot } from "../../../test-support/process.ts";
import { freePort } from "../../../test-support/service.ts";
import { createHarness } from "./support.ts";

const harness = createHarness();
afterEach(() => harness.cleanup());

const cliScript = fileURLToPath(new URL("../src/chaos-cli.ts", import.meta.url));
const CASCADE_DECOY_LINE = "chaos: cascade-decoy (acquirer-beta +8000 ms per call)\n";
const USAGE_LINE = "usage: npm run chaos -- cascade-decoy | clear | status\n";

interface CliRun {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly ms: number;
}

/** Runs `chaos-cli.ts` as the presenter does, against `chaosPort`, and waits for it to exit. */
function runCli(args: string[], chaosPort: number): Promise<CliRun> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const child = spawn(process.execPath, [cliScript, ...args], {
      cwd: repoRoot,
      env: { ...process.env, CHAOS_PORT: String(chaosPort) },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    // Why: a CLI that never gives up must fail the exit-code and time assertions, not hit the test timeout.
    const killer = setTimeout(() => child.kill("SIGKILL"), 6000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(killer);
      resolve({ code, stdout, stderr, ms: performance.now() - startedAt });
    });
  });
}

async function controlledSandbox() {
  const db = await harness.migratedDatabase();
  const sandbox = await harness.sandbox(db, { chaosPort: 0 });
  expect(sandbox.chaosPort, "the sandbox has a control port").toBeTypeOf("number");
  return { sandbox, chaosPort: sandbox.chaosPort as number };
}

async function currentScenario(chaosPort: number): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${chaosPort}/chaos/scenario`);
  expect(response.status).toBe(200);
  return response.text();
}

async function putScenario(chaosPort: number, scenario: string): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${chaosPort}/chaos/scenario`, {
    method: "PUT",
    body: `{"scenario":"${scenario}"}`,
  });
  expect(response.status).toBe(200);
}

/** A TCP listener that counts chaos HTTP requests and never answers; `hangUp` closes after the first data. */
async function tcpListener(
  options: { hangUp?: boolean } = {},
): Promise<{ port: number; requests(): number }> {
  const sockets: Socket[] = [];
  let requests = 0;
  const server: Server = createServer((socket) => {
    sockets.push(socket);
    socket.on("error", () => undefined);
    // Why: unrelated loopback probes must not count as requests made by the presenter CLI.
    socket.once("data", (chunk: Buffer) => {
      if (/^(GET|PUT) \/chaos\/scenario /.test(chunk.toString("latin1"))) requests++;
      if (options.hangUp) socket.destroy();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  harness.onCleanup(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
  return {
    port: (server.address() as { port: number }).port,
    requests: () => requests,
  };
}

describe("chaos presenter command", () => {
  test("cascade-decoy command", async () => {
    const { chaosPort } = await controlledSandbox();
    expect(await currentScenario(chaosPort)).toBe('{"scenario":"none"}');

    const run = await runCli(["cascade-decoy"], chaosPort);

    expect(run.code).toBe(0);
    expect(run.stdout).toBe(CASCADE_DECOY_LINE);
    expect(run.stderr).toBe("");
    expect(await currentScenario(chaosPort)).toBe('{"scenario":"cascade-decoy"}');
  });

  test("clear command", async () => {
    const { chaosPort } = await controlledSandbox();
    await putScenario(chaosPort, "cascade-decoy");
    expect(await currentScenario(chaosPort)).toBe('{"scenario":"cascade-decoy"}');

    const run = await runCli(["clear"], chaosPort);

    expect(run.code).toBe(0);
    expect(run.stdout).toBe("chaos: none\n");
    expect(run.stderr).toBe("");
    expect(await currentScenario(chaosPort)).toBe('{"scenario":"none"}');
  });

  test("status command", async () => {
    const { chaosPort } = await controlledSandbox();

    const whileNone = await runCli(["status"], chaosPort);
    expect(whileNone).toMatchObject({ code: 0, stdout: "chaos: none\n", stderr: "" });
    expect(await currentScenario(chaosPort)).toBe('{"scenario":"none"}');

    await putScenario(chaosPort, "cascade-decoy");
    const whileDecoy = await runCli(["status"], chaosPort);
    expect(whileDecoy).toMatchObject({ code: 0, stdout: CASCADE_DECOY_LINE, stderr: "" });
    expect(await currentScenario(chaosPort)).toBe('{"scenario":"cascade-decoy"}');
  });

  test("usage errors", async () => {
    const spy = await tcpListener({ hangUp: true });
    // Context: local preview tools probe listener roots; those requests are unrelated to the CLI command.
    await new Promise<void>((resolve, reject) => {
      const probe = createConnection({ host: "127.0.0.1", port: spy.port }, () => {
        probe.end("GET / HTTP/1.1\r\nHost: localhost\r\n\r\n");
      });
      probe.on("error", reject);
      probe.once("close", () => resolve());
    });
    const usageErrors = [[], ["start"], ["cascade-decoy", "extra"]];
    expect(usageErrors).toHaveLength(3);

    for (const args of usageErrors) {
      const run = await runCli(args, spy.port);
      expect(run, `args ${JSON.stringify(args)}`).toMatchObject({
        code: 2,
        stdout: "",
        stderr: USAGE_LINE,
      });
    }
    expect(spy.requests()).toBe(0);

    // Why: the spy must see a real request for the earlier no-request assertion to prove anything.
    await runCli(["status"], spy.port);
    expect(spy.requests()).toBe(1);
  });

  test("unreachable control port", async () => {
    const closedPort = await freePort();
    const closed = await runCli(["status"], closedPort);
    expect(closed).toMatchObject({
      code: 1,
      stdout: "",
      stderr: `chaos: cannot reach the sandbox control port at 127.0.0.1:${closedPort}\n`,
    });

    const silent = await tcpListener();
    const hung = await runCli(["status"], silent.port);
    expect(hung).toMatchObject({
      code: 1,
      stdout: "",
      stderr: `chaos: cannot reach the sandbox control port at 127.0.0.1:${silent.port}\n`,
    });
    expect(hung.ms).toBeLessThan(3000);
    // Why: a received chaos request proves the exit above came from the timeout, not a refusal.
    expect(silent.requests()).toBeGreaterThanOrEqual(1);
  });
});
