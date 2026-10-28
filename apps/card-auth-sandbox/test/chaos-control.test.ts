import { networkInterfaces } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { resolveChaosPort } from "../src/chaos.ts";
import { createHarness } from "./support.ts";

const harness = createHarness();
afterEach(() => harness.cleanup());

/** A request to the control listener, with the status and the raw body text. */
async function control(
  chaosPort: number | undefined,
  method: string,
  path: string,
  body?: string,
): Promise<{ status: number; text: string }> {
  expect(chaosPort, "the sandbox has a control port").toBeTypeOf("number");
  const response = await fetch(`http://127.0.0.1:${chaosPort}${path}`, { method, body });
  return { status: response.status, text: await response.text() };
}

async function controlledSandbox(options: { host?: string } = {}) {
  const db = await harness.migratedDatabase();
  const sandbox = await harness.sandbox(db, { chaosPort: 0, ...options });
  return sandbox;
}

describe("chaos control", () => {
  test("starts with no scenario", async () => {
    const sandbox = await controlledSandbox();

    const response = await control(sandbox.chaosPort, "GET", "/chaos/scenario");

    expect(response).toEqual({ status: 200, text: '{"scenario":"none"}' });
  });

  test("sets cascade-decoy", async () => {
    const sandbox = await controlledSandbox();

    const put = await control(
      sandbox.chaosPort,
      "PUT",
      "/chaos/scenario",
      '{"scenario":"cascade-decoy"}',
    );
    const get = await control(sandbox.chaosPort, "GET", "/chaos/scenario");

    expect(put).toEqual({ status: 200, text: '{"scenario":"cascade-decoy"}' });
    expect(get).toEqual({ status: 200, text: '{"scenario":"cascade-decoy"}' });
  });

  test("clears to none idempotently", async () => {
    const sandbox = await controlledSandbox();
    const set = await control(
      sandbox.chaosPort,
      "PUT",
      "/chaos/scenario",
      '{"scenario":"cascade-decoy"}',
    );
    expect(set.text).toBe('{"scenario":"cascade-decoy"}');

    const first = await control(sandbox.chaosPort, "PUT", "/chaos/scenario", '{"scenario":"none"}');
    const second = await control(
      sandbox.chaosPort,
      "PUT",
      "/chaos/scenario",
      '{"scenario":"none"}',
    );
    const get = await control(sandbox.chaosPort, "GET", "/chaos/scenario");

    expect(first).toEqual({ status: 200, text: '{"scenario":"none"}' });
    expect(second).toEqual({ status: 200, text: '{"scenario":"none"}' });
    expect(get).toEqual({ status: 200, text: '{"scenario":"none"}' });
  });

  test("rejects invalid scenario bodies", async () => {
    const sandbox = await controlledSandbox();
    const set = await control(
      sandbox.chaosPort,
      "PUT",
      "/chaos/scenario",
      '{"scenario":"cascade-decoy"}',
    );
    expect(set.status).toBe(200);
    const invalidBodies = [
      "not json",
      "{}",
      '{"scenario":"pop-corn"}',
      '{"scenario":null}',
      '{"scenario":8000}',
      "",
    ];
    expect(invalidBodies).toHaveLength(6);

    for (const body of invalidBodies) {
      const response = await control(sandbox.chaosPort, "PUT", "/chaos/scenario", body);
      expect(response, `body ${JSON.stringify(body)}`).toEqual({
        status: 400,
        text: '{"error":"invalid_scenario"}',
      });
      const current = await control(sandbox.chaosPort, "GET", "/chaos/scenario");
      expect(current.text, `scenario after ${JSON.stringify(body)}`).toBe(
        '{"scenario":"cascade-decoy"}',
      );
    }
  });

  test("other routes are not found", async () => {
    const sandbox = await controlledSandbox();
    const requests = [
      ["POST", "/chaos/scenario"],
      ["DELETE", "/chaos/scenario"],
      ["GET", "/chaos"],
      ["GET", "/telemetry/pool"],
    ] as const;
    expect(requests).toHaveLength(4);

    for (const [method, path] of requests) {
      const response = await control(
        sandbox.chaosPort,
        method,
        path,
        method === "POST" ? '{"scenario":"cascade-decoy"}' : undefined,
      );
      expect(response.status, `${method} ${path}`).toBe(404);
    }
    const after = await control(sandbox.chaosPort, "GET", "/chaos/scenario");
    expect(after.text).toBe('{"scenario":"none"}');
  });

  test("no control listener without a port", async () => {
    const db = await harness.migratedDatabase();

    const sandbox = await harness.sandbox(db);

    expect(sandbox.chaosPort).toBeUndefined();
  });

  test("resolves CHAOS_PORT", () => {
    expect(resolveChaosPort({})).toBeUndefined();
    expect(resolveChaosPort({ CHAOS_PORT: "" })).toBeUndefined();
    expect(resolveChaosPort({ CHAOS_PORT: "4001" })).toBe(4001);
    for (const bad of ["abc", "-1", "70000", "1.5"]) {
      expect(() => resolveChaosPort({ CHAOS_PORT: bad }), `CHAOS_PORT=${bad}`).toThrow(
        /CHAOS_PORT must be an integer from 1 to 65535/,
      );
    }
  });

  test("control listener is loopback only", async () => {
    const sandbox = await controlledSandbox({ host: "0.0.0.0" });
    const external = Object.values(networkInterfaces())
      .flat()
      .find((address) => address?.family === "IPv4" && !address.internal)?.address;
    // Why: without a non-loopback IPv4 address, this test cannot prove the control listener is private.
    expect(external, "a non-loopback IPv4 address on this host").toBeTypeOf("string");

    // Why: the public listener must answer on this address to rule out a host that refuses all external traffic.
    const publicHealth = await fetch(`http://${external}:${sandbox.port}/healthz`);
    expect(publicHealth.status === 200 || publicHealth.status === 503).toBe(true);
    await expect(fetch(`http://${external}:${sandbox.chaosPort}/chaos/scenario`)).rejects.toThrow();

    const publicGet = await fetch(`http://127.0.0.1:${sandbox.port}/chaos/scenario`);
    const publicPut = await fetch(`http://127.0.0.1:${sandbox.port}/chaos/scenario`, {
      method: "PUT",
      body: '{"scenario":"cascade-decoy"}',
    });
    expect(publicGet.status).toBe(404);
    expect(publicPut.status).toBe(404);
    const current = await control(sandbox.chaosPort, "GET", "/chaos/scenario");
    expect(current.text).toBe('{"scenario":"none"}');
  });
});
