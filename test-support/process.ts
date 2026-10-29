import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export interface RunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Runs a TypeScript entry file the way production does (Node type stripping) and waits for it to exit.
 * With `timeoutMs`, a process still running then is killed and reported with a `null` code, so a script that
 * should have exited fails the caller's assertions instead of hanging the test.
 */
export function runNode(
  script: string,
  env: Record<string, string>,
  timeoutMs?: number,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const killer =
      timeoutMs === undefined ? undefined : setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(killer);
      resolve({ code, stdout, stderr });
    });
  });
}
