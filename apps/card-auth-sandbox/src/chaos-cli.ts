// The presenter command behind `npm run chaos`. It runs inside the sandbox container, where the loopback
// control listener is reachable (chaos-presenter-only).
import {
  type ChaosScenario,
  DEFAULT_CHAOS_PORT,
  describeScenario,
  parseScenario,
  resolveChaosPort,
} from "./chaos.ts";

const USAGE = "usage: npm run chaos -- cascade-decoy | clear | status";
const REQUEST_TIMEOUT_MS = 2000;

/** The scenario each command sets; `status` sets nothing. */
const COMMANDS = new Map<string, ChaosScenario | undefined>([
  ["cascade-decoy", "cascade-decoy"],
  ["clear", "none"],
  ["status", undefined],
]);

function fail(code: 1 | 2, message: string): never {
  console.error(message);
  process.exit(code);
}

const args = process.argv.slice(2);
const command = args[0];
if (args.length !== 1 || command === undefined || !COMMANDS.has(command)) fail(2, USAGE);
const requested = COMMANDS.get(command);

let port: number;
try {
  port = resolveChaosPort(process.env) ?? DEFAULT_CHAOS_PORT;
} catch (error) {
  fail(1, `chaos: ${error instanceof Error ? error.message : String(error)}`);
}

let status: number;
let text: string;
try {
  const response = await fetch(`http://127.0.0.1:${port}/chaos/scenario`, {
    method: requested === undefined ? "GET" : "PUT",
    body: requested === undefined ? undefined : JSON.stringify({ scenario: requested }),
    // Why: the signal also covers reading the body, so a listener that accepts and never answers still ends here.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  status = response.status;
  text = await response.text();
} catch {
  fail(1, `chaos: cannot reach the sandbox control port at 127.0.0.1:${port}`);
}

const answered = parseScenario(text);
if (
  status !== 200 ||
  answered === undefined ||
  (requested !== undefined && answered !== requested)
) {
  fail(
    1,
    `chaos: unexpected answer from the sandbox control port (HTTP ${status}): ${text.slice(0, 200)}`,
  );
}
console.log(describeScenario(answered));
