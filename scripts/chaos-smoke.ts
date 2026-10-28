// Chaos smoke test for the running compose stack: starts the cascade decoy with `npm run chaos`, waits for the
// sandbox app pool to saturate, clears it, and waits for the pool to drain. It drives docker compose from the
// repository root and always leaves the stack at scenario `none`.
import { spawnSync } from "node:child_process";

const SATURATE_WITHIN_MS = 10_000;
const DRAIN_WITHIN_MS = 15_000;
// Context: a decoy left over from a rehearsal still holds connections for up to 8 s after `clear`.
const LEFTOVER_DRAIN_WITHIN_MS = 20_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** `npm run chaos -- <command>`, the presenter's command, and its one stdout line. */
function chaos(command: "cascade-decoy" | "clear" | "status"): string {
  const result = run("npm", ["run", "--silent", "chaos", "--", command]);
  if (result.code !== 0) {
    throw new Error(
      `npm run chaos -- ${command} exited ${result.code}: ${(result.stderr || result.stdout).trim()}`,
    );
  }
  return result.stdout.trim();
}

interface Pool {
  readonly total: number;
  readonly idle: number;
  readonly waiting: number;
}

/** The sandbox's `/telemetry/pool` read from inside its container, the way the compose probe in C18 reads it. */
function readPool(): Pool {
  const result = run("docker", [
    "compose",
    "exec",
    "-T",
    "card-auth-sandbox",
    "wget",
    "-qO-",
    "http://127.0.0.1:4000/telemetry/pool",
  ]);
  if (result.code !== 0)
    throw new Error(`pool probe exited ${result.code}: ${result.stderr.trim()}`);
  return JSON.parse(result.stdout) as Pool;
}

async function waitForPool(
  what: string,
  matches: (pool: Pool) => boolean,
  withinMs: number,
): Promise<number> {
  const startedAt = Date.now();
  let last: Pool | undefined;
  while (Date.now() - startedAt <= withinMs) {
    last = readPool();
    if (matches(last)) return Date.now() - startedAt;
    await sleep(250);
  }
  throw new Error(`pool never ${what} within ${withinMs} ms; last reading ${JSON.stringify(last)}`);
}

function expectLine(actual: string, expected: string): void {
  if (actual !== expected) throw new Error(`expected "${expected}", got "${actual}"`);
}

let failed = false;
try {
  expectLine(chaos("clear"), "chaos: none");
  await waitForPool("had no waiting calls", (pool) => pool.waiting === 0, LEFTOVER_DRAIN_WITHIN_MS);

  expectLine(chaos("cascade-decoy"), "chaos: cascade-decoy (acquirer-beta +8000 ms per call)");
  const saturatedMs = await waitForPool(
    "saturated (total 10, idle 0, waiting at least 1)",
    (pool) => pool.total === 10 && pool.idle === 0 && pool.waiting >= 1,
    SATURATE_WITHIN_MS,
  );
  console.log(`ok cascade-decoy saturates the app pool (${saturatedMs} ms)`);

  expectLine(chaos("clear"), "chaos: none");
  const drainedMs = await waitForPool(
    "drained (waiting 0)",
    (pool) => pool.waiting === 0,
    DRAIN_WITHIN_MS,
  );
  console.log(`ok clear drains the app pool (${drainedMs} ms)`);
} catch (error) {
  failed = true;
  console.error(`FAIL chaos smoke: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  // Why: a failed probe must not leave the decoy running for the next rehearsal.
  try {
    expectLine(chaos("clear"), "chaos: none");
  } catch (error) {
    failed = true;
    console.error(
      `FAIL chaos smoke: could not leave the stack at none: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
process.exit(failed ? 1 : 0);
