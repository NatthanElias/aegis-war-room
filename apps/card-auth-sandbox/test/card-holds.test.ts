import { afterEach, describe, expect, test } from "vitest";
import { createHarness, sqlState } from "./support.ts";

const harness = createHarness();
afterEach(() => harness.cleanup());

const PAN = "4111111111111111";

describe("card_holds", () => {
  test("no full PAN", async () => {
    const db = await harness.migratedDatabase();
    const sandbox = await harness.sandbox(db);
    const admin = await harness.client(db.url);

    await sandbox.authorize(PAN, 1000);

    const columns = (
      await admin.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'card_holds'",
      )
    ).rows.map((row) => row.column_name as string);
    expect(columns.sort()).toEqual(
      [
        "acquirer",
        "amount_cents",
        "bin",
        "brand",
        "created_at",
        "decided_at",
        "id",
        "last4",
        "status",
        "trace_id",
      ].sort(),
    );
    const dump = (await admin.query("SELECT row_to_json(c)::text AS row FROM card_holds c")).rows;
    expect(dump).toHaveLength(1);
    expect(dump[0].row).toContain('"bin":"411111"');
    expect(dump[0].row).toContain('"last4":"1111"');
    expect(dump[0].row).not.toContain(PAN);
  });

  test("grants", async () => {
    const db = await harness.migratedDatabase();
    const admin = await harness.client(db.url);
    const app = await harness.client(db.roleUrl("sandbox_app"));
    const diag = await harness.client(db.roleUrl("warroom_diag"));
    const sandboxAdmin = await harness.client(db.roleUrl("sandbox_admin"));
    await admin.query(
      `INSERT INTO card_holds (trace_id, brand, acquirer, bin, last4, amount_cents, status)
       VALUES (gen_random_uuid(), 'visa', 'acquirer-alpha', '411111', '1111', 1000, 'APPROVED')`,
    );

    expect(await sqlState(app.query("DELETE FROM card_holds"))).toBe("42501");
    expect(await sqlState(app.query("TRUNCATE card_holds"))).toBe("42501");
    expect((await diag.query("SELECT count(*)::int AS n FROM card_holds")).rows[0].n).toBe(1);
    expect(
      await sqlState(
        diag.query(
          `INSERT INTO card_holds (trace_id, brand, acquirer, bin, last4, amount_cents, status)
           VALUES (gen_random_uuid(), 'visa', 'acquirer-alpha', '411111', '1111', 1000, 'APPROVED')`,
        ),
      ),
    ).toBe("42501");
    const updated = await sandboxAdmin.query("UPDATE card_holds SET status = status");
    expect(updated.rowCount).toBe(1);
    const ledger = await admin.query("SELECT name FROM sandbox_migrations");
    expect(ledger.rows.map((row) => row.name)).toContain("0002_card_holds.sql");
    // A row survives both refused statements, so the refusals were not silent no-ops on an empty table.
    expect((await admin.query("SELECT count(*)::int AS n FROM card_holds")).rows[0].n).toBe(1);
  });
});
