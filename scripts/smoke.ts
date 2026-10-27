// Smoke test for a stack that is already running. It only makes HTTP requests and opens a Chord WebSocket.
// Env: SMOKE_WARROOM_URL (default http://127.0.0.1:8080), SMOKE_SANDBOX_URL (optional, see below),
// SMOKE_SANDBOX_WAIT_MS (default 10000).
import {
  connectShell,
  connectWarroom,
  type IncidentState,
  type ShellState,
} from "@warroom/contracts";

const warroomUrl =
  process.env.SMOKE_WARROOM_URL ?? `http://127.0.0.1:${process.env.WARROOM_PORT ?? 8080}`;
const sandboxUrl = process.env.SMOKE_SANDBOX_URL;
const sandboxWaitMs = Number(process.env.SMOKE_SANDBOX_WAIT_MS ?? 10_000);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(3000) });
}

async function expectHealthy(url: string): Promise<void> {
  const response = await get(`${url}/healthz`);
  const body = await response.json();
  if (response.status !== 200 || body?.status !== "ok") {
    throw new Error(`answered ${response.status} ${JSON.stringify(body)}`);
  }
}

let latest: ShellState | undefined;
let shellError: string | undefined;

async function openShell(): Promise<void> {
  const url = `${warroomUrl.replace(/^http/, "ws")}/chord?user=alice`;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no shell state within 5 s")), 5000);
    connectShell(url, {
      onState(state) {
        latest = state;
        clearTimeout(timer);
        resolve();
      },
      onClose({ code }) {
        shellError = `socket closed with ${code}`;
        reject(new Error(shellError));
      },
    });
  });
  const state = latest;
  if (state?.user.id !== "alice" || state.user.role !== "IC") {
    throw new Error(`unexpected user ${JSON.stringify(state?.user)}`);
  }
  if (!state.incidentId || typeof state.conversationId !== "number") {
    throw new Error(`incomplete shell state ${JSON.stringify(state)}`);
  }
}

// Why: literal lists on purpose, so a wrong value in the contracts package cannot make the probe agree with it.
const SEVERITIES = ["SEV-1", "SEV-2", "SEV-3"];
const PHASES = ["DETECT", "TRIAGE", "MITIGATE", "RESOLVE", "POSTMORTEM"];
const ROSTER_USERS = ["alice", "bob", "carol"];

async function openIncident(): Promise<void> {
  const url = `${warroomUrl.replace(/^http/, "ws")}/chord?user=alice`;
  const state = await new Promise<IncidentState>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no incident state within 5 s")), 5000);
    const connection = connectWarroom(url, {
      onIncident(incident) {
        clearTimeout(timer);
        connection.close();
        resolve(incident);
      },
      onClose({ code }) {
        clearTimeout(timer);
        reject(new Error(`socket closed with ${code}`));
      },
    });
  });
  if (!SEVERITIES.includes(state.sev))
    throw new Error(`unexpected sev ${JSON.stringify(state.sev)}`);
  if (!PHASES.includes(state.phase))
    throw new Error(`unexpected phase ${JSON.stringify(state.phase)}`);
  const roster = Object.keys(state.roster ?? {});
  if (ROSTER_USERS.some((user) => !roster.includes(user))) {
    throw new Error(`incomplete roster ${JSON.stringify(state.roster)}`);
  }
}

// Context: compose publishes no sandbox port, so without SMOKE_SANDBOX_URL the sandbox probe reads the
// status warroom-server derives from the sandbox's own /healthz, which the shell state carries.
async function sandboxViaShell(): Promise<void> {
  if (latest === undefined)
    throw new Error(`needs the warroom-server /chord probe (${shellError ?? "no state"})`);
  const deadline = Date.now() + sandboxWaitMs;
  while (latest.sandbox !== "up") {
    if (Date.now() > deadline)
      throw new Error(`warroom-server reports the sandbox ${latest.sandbox}`);
    await sleep(200);
  }
}

const probes: Array<[string, () => Promise<void>]> = [
  ["warroom-server /healthz", () => expectHealthy(warroomUrl)],
  [
    "warroom-server GET /",
    async () => {
      const response = await get(`${warroomUrl}/?user=alice`);
      const page = await response.text();
      if (response.status !== 200 || !page.includes('id="root"')) {
        throw new Error(`answered ${response.status} without the shell page`);
      }
    },
  ],
  ["warroom-server /chord", openShell],
  ["warroom-server warroom.incident", openIncident],
  [
    sandboxUrl ? "card-auth-sandbox /healthz" : "card-auth-sandbox /healthz (via warroom-server)",
    () => (sandboxUrl ? expectHealthy(sandboxUrl) : sandboxViaShell()),
  ],
];

let failed = 0;
for (const [name, run] of probes) {
  try {
    await run();
    console.log(`ok ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
