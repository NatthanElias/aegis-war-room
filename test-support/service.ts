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
 * `env.PORT` is chosen here.
 */
export async function startService(
  script: string,
  env: Record<string, string>,
): Promise<RunningService> {
  const port = await freePort();
  const child = spawn(process.execPath, [script], {
    cwd: repoRoot,
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    output += chunk;
  });

  const service: RunningService = {
    port,
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
      await getHealthz(port);
      return service;
    } catch {
      if (Date.now() > deadline) {
        await service.stop();
        throw new Error(`${script} never answered /healthz:\n${output}`);
      }
      await sleep(50);
    }
  }
}
