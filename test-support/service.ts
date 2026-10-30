import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import { repoRoot } from "./process.ts";

export interface RunningService {
  readonly port: number;
  readonly child: ChildProcess;
  readonly pid: number;
  readonly running: boolean;
  healthz(): Promise<{ status: number; body: unknown }>;
  stop(): Promise<void>;
}

export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getHealthz(port: number): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`http://127.0.0.1:${port}/healthz`);
  return { status: response.status, body: await response.json() };
}

/**
 * Starts a service entry file as a child process (the way compose does) and waits until `/healthz` answers at all.
 * The child binds port 0 and announces its actual port before readiness is checked.
 */
export async function startService(
  script: string,
  env: Record<string, string>,
): Promise<RunningService> {
  let port = 0;
  const child = spawn(process.execPath, [script], {
    cwd: repoRoot,
    env: { ...process.env, ...env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += chunk;
    // Hazard: reserving then releasing a port lets another test bind it before this child starts.
    // Why: both service mains announce the port after listen, so readiness belongs to this child.
    const announced = /listening on ([1-9][0-9]*)/.exec(output);
    if (announced) port = Number(announced[1]);
  });
  child.stderr?.on("data", (chunk) => {
    output += chunk;
  });

  const service: RunningService = {
    get port() {
      return port;
    },
    child,
    pid: child.pid ?? -1,
    get running() {
      return child.exitCode === null && child.signalCode === null;
    },
    healthz: () => getHealthz(port),
    async stop() {
      if (!service.running) return;
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await exited;
    },
  };

  const deadline = Date.now() + 10_000;
  for (;;) {
    if (!service.running) throw new Error(`${script} exited early:\n${output}`);
    try {
      if (port !== 0) {
        await getHealthz(port);
        return service;
      }
    } catch {
      // Context: this child's port may be listening before its health endpoint is ready.
    }
    if (Date.now() > deadline) {
      await service.stop();
      throw new Error(`${script} never announced a port and answered /healthz:\n${output}`);
    }
    await sleep(50);
  }
}
