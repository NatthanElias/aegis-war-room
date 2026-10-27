import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import WebSocket from "ws";
import { type FakeSandbox, startFakeSandbox } from "../../../test-support/fake-sandbox.ts";
import { type OpenShell, openShell } from "../../../test-support/shell-client.ts";
import { type RunningServer, startServer } from "../src/server.ts";

let incidentsDir: string;
let sandbox: FakeSandbox;
let server: RunningServer;
const shells: OpenShell[] = [];

beforeEach(async () => {
  incidentsDir = await mkdtemp(join(tmpdir(), "wr-shell-"));
  sandbox = await startFakeSandbox();
  server = await startServer({
    port: 0,
    host: "127.0.0.1",
    incidentId: "test-inc",
    incidentsDir,
    sandboxUrl: sandbox.url,
  });
});

afterEach(async () => {
  for (const shell of shells.splice(0)) shell.close();
  await server.close();
  await sandbox.close();
  await rm(incidentsDir, { recursive: true, force: true });
});

async function connect(user: string): Promise<OpenShell> {
  const shell = await openShell(server.port, user);
  shells.push(shell);
  return shell;
}

/** Everything a raw WebSocket receives until the server closes it. */
function rawSession(path: string): Promise<{ code: number; frames: Array<{ t: string }> }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}${path}`);
    setTimeout(() => reject(new Error(`${path} was not closed by the server`)), 5000).unref();
    const frames: Array<{ t: string }> = [];
    socket.on("message", (data) => frames.push(JSON.parse(String(data))));
    socket.on("close", (code) => resolve({ code, frames }));
    socket.on("error", reject);
  });
}

describe("warroom.shell", () => {
  test("seeded users read their own identity and role", async () => {
    const expected = [
      { user: "alice", role: "IC" },
      { user: "bob", role: "Responder" },
      { user: "carol", role: "Observer" },
    ];

    for (const { user, role } of expected) {
      const shell = await connect(user);
      expect(shell.latest()).toEqual({
        incidentId: "test-inc",
        conversationId: server.conversationId,
        user: { id: user, role },
        sandbox: "up",
      });
    }
    expect(typeof server.conversationId).toBe("number");
  });

  test("unknown user is closed before any state arrives", async () => {
    const mallory = await rawSession("/chord?user=mallory");
    const missing = await rawSession("/chord");

    for (const session of [mallory, missing]) {
      expect(session.code).toBe(1000);
      expect(session.frames.map((frame) => frame.t)).toEqual(["bye"]);
    }
  });

  test("sandbox status follows the sandbox healthz within 5 s", async () => {
    const shell = await connect("alice");
    expect(shell.latest().sandbox).toBe("up");

    let mark = shell.states.length;
    sandbox.setStatus(503);
    await shell.waitFor((state) => state.sandbox === "down", 5000, mark);

    mark = shell.states.length;
    sandbox.setStatus(200);
    const backUp = await shell.waitFor((state) => state.sandbox === "up", 5000, mark);
    expect(backUp.sandbox).toBe("up");
  });
});
