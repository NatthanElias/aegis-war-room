import type pg from "pg";
import { afterEach, describe, expect, test } from "vitest";
import { createAppPool } from "../src/app-pool.ts";
import { authorize } from "../src/authorize.ts";
import { createTelemetry } from "../src/telemetry.ts";
import { createHarness, recordingAcquirers, waitFor } from "./support.ts";

const harness = createHarness();
afterEach(() => harness.cleanup());

const holdsFor = async (client: pg.Client, traceId: string) =>
  (await client.query("SELECT * FROM card_holds WHERE trace_id = $1", [traceId])).rows;

describe("authorize", () => {
  test("visa routes to acquirer-alpha", async () => {
    const db = await harness.migratedDatabase();
    const { acquirers, calls } = recordingAcquirers();
    const sandbox = await harness.sandbox(db, { acquirers });
    const admin = await harness.client(db.url);

    const result = await sandbox.authorize("4111111111111111", 1000);

    const rows = (await admin.query("SELECT * FROM card_holds")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      trace_id: result.traceId,
      brand: "visa",
      acquirer: "acquirer-alpha",
      status: "APPROVED",
      bin: "411111",
      last4: "1111",
      amount_cents: 1000,
    });
    expect(rows[0].decided_at).toBeInstanceOf(Date);
    expect(calls.map((call) => call.acquirer)).toEqual(["acquirer-alpha"]);
  });

  test("mastercard routes to acquirer-beta", async () => {
    const db = await harness.migratedDatabase();
    const { acquirers, calls } = recordingAcquirers();
    const sandbox = await harness.sandbox(db, { acquirers });
    const admin = await harness.client(db.url);

    const result = await sandbox.authorize("5555555555554444", 1000);

    const rows = await holdsFor(admin, result.traceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      brand: "mastercard",
      acquirer: "acquirer-beta",
      status: "APPROVED",
      bin: "555555",
      last4: "4444",
    });
    expect(calls.map((call) => call.acquirer)).toEqual(["acquirer-beta"]);
  });

  test("unsupported BIN is rejected before any acquirer or database work", async () => {
    const db = await harness.migratedDatabase();
    const { acquirers, calls } = recordingAcquirers();
    const pool = createAppPool(db.roleUrl("sandbox_app"));
    harness.onCleanup(() => pool.end());
    const admin = await harness.client(db.url);

    await expect(
      authorize(
        { pool, acquirers, telemetry: createTelemetry() },
        { pan: "378282246310005", amountCents: 1000 },
      ),
    ).rejects.toMatchObject({ code: "unsupported_bin" });

    expect(calls).toHaveLength(0);
    expect((await admin.query("SELECT count(*)::int AS n FROM card_holds")).rows[0].n).toBe(0);
    // The pool opens its first connection only on demand, so 0 shows no connection was checked out.
    expect(pool.totalCount).toBe(0);
  });

  test("declines cents ending in 51", async () => {
    const db = await harness.migratedDatabase();
    const sandbox = await harness.sandbox(db);
    const admin = await harness.client(db.url);
    const cases = [
      { pan: "4111111111111111", acquirer: "acquirer-alpha", cents: 1050, status: "APPROVED" },
      { pan: "4111111111111111", acquirer: "acquirer-alpha", cents: 1051, status: "DECLINED" },
      { pan: "4111111111111111", acquirer: "acquirer-alpha", cents: 1052, status: "APPROVED" },
      { pan: "5555555555554444", acquirer: "acquirer-beta", cents: 1050, status: "APPROVED" },
      { pan: "5555555555554444", acquirer: "acquirer-beta", cents: 1051, status: "DECLINED" },
      { pan: "5555555555554444", acquirer: "acquirer-beta", cents: 1052, status: "APPROVED" },
    ];
    expect(cases).toHaveLength(6);

    for (const { pan, acquirer, cents, status } of cases) {
      const result = await sandbox.authorize(pan, cents);
      const rows = await holdsFor(admin, result.traceId);
      expect(rows, `${acquirer} ${cents}`).toHaveLength(1);
      expect(rows[0], `${acquirer} ${cents}`).toMatchObject({
        acquirer,
        status,
        amount_cents: cents,
      });
    }
  });

  test("holds the transaction open until the acquirer answers", async () => {
    const db = await harness.migratedDatabase();
    const { acquirers, calls } = recordingAcquirers();
    const sandbox = await harness.sandbox(db, { acquirers });
    sandbox.setAcquirerDelay("acquirer-beta", 2000);
    const admin = await harness.client(db.url);
    const diag = await harness.client(db.roleUrl("warroom_diag"));

    const pending = sandbox.authorize("5555555555554444", 1000);
    const call = await waitFor("the acquirer call", () => calls[0], 1500);
    const session = await waitFor(
      "an idle in transaction sandbox session",
      async () =>
        (
          await admin.query(
            `SELECT state FROM pg_stat_activity
             WHERE datname = $1 AND application_name = 'card-auth-sandbox' AND state = 'idle in transaction'`,
            [db.name],
          )
        ).rows[0],
      1500,
    );
    const during = await diag.query(
      "SELECT count(*)::int AS n FROM card_holds WHERE trace_id = $1",
      [call.traceId],
    );
    const result = await pending;
    const after = await diag.query("SELECT status FROM card_holds WHERE trace_id = $1", [
      call.traceId,
    ]);

    expect(session.state).toBe("idle in transaction");
    expect(during.rows[0].n).toBe(0);
    expect(result.traceId).toBe(call.traceId);
    expect(after.rows).toEqual([{ status: "APPROVED" }]);
  });

  test("rolls back on acquirer failure", async () => {
    const db = await harness.migratedDatabase();
    const { acquirers, calls } = recordingAcquirers({ failing: "acquirer-beta" });
    const pool = createAppPool(db.roleUrl("sandbox_app"));
    harness.onCleanup(() => pool.end());
    const context = { pool, acquirers, telemetry: createTelemetry() };
    const admin = await harness.client(db.url);
    await authorize(context, { pan: "4111111111111111", amountCents: 1000 });
    const idleBefore = pool.idleCount;
    expect(idleBefore).toBe(1);

    await expect(
      authorize(context, { pan: "5555555555554444", amountCents: 1000 }),
    ).rejects.toThrow("acquirer-beta exploded");

    const failed = calls.find((call) => call.acquirer === "acquirer-beta");
    expect(failed).toBeDefined();
    expect(await holdsFor(admin, failed?.traceId ?? "")).toHaveLength(0);
    expect((await admin.query("SELECT count(*)::int AS n FROM card_holds")).rows[0].n).toBe(1);
    expect(pool.idleCount).toBe(idleBefore);
    expect(pool.totalCount).toBe(1);
  });
});
