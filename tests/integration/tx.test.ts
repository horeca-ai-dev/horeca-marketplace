/**
 * Transaction helpers against a real Postgres (D2-B1).
 *
 * Needs a migrated database and the three logins (.env: DATABASE_URL, DATABASE_WORKER_URL).
 * From D3-B1 the same test runs on a Testcontainers database instead — the test body stays the same.
 */
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import {
  withSystemTx,
  withTx,
  withUserTx,
  type RlsContext,
} from "@/server/db/tx";

const actor: RlsContext = {
  userId: "user_1",
  orgId: "org_1",
  orgType: "buyer",
  role: "owner",
};

type Row = Record<string, unknown>;
const contextSql = sql`
  select current_user as "login",
         current_setting('app.user_id', true)  as "userId",
         current_setting('app.org_id', true)   as "orgId",
         current_setting('app.org_type', true) as "orgType",
         current_setting('app.role', true)     as "role"`;

afterAll(async () => {
  await closeDb();
});

describe("withTx", () => {
  it("connects as horeca_app and sets the four RLS settings inside the transaction", async () => {
    const row = await withTx(
      actor,
      async (tx) => (await tx.execute<Row>(contextSql)).rows[0],
    );
    expect(row).toEqual({ login: "horeca_app", ...actor });
  });

  it("leaves nothing behind for the next transaction on the same connection", async () => {
    const pid = sql`select pg_backend_pid() as pid`;
    const first = await withTx(
      actor,
      async (tx) => (await tx.execute<Row>(pid)).rows[0]?.pid,
    );
    // The pool hands the same idle connection back; a later transaction must not see the previous actor.
    const row = await withUserTx("user_2", async (tx) => ({
      ...(await tx.execute<Row>(contextSql)).rows[0],
      pid: (await tx.execute<Row>(pid)).rows[0]?.pid,
    }));
    expect(row.pid).toBe(first); // really the same connection, otherwise this test proves nothing
    expect(row).toMatchObject({
      userId: "user_2",
      orgId: "",
      orgType: "",
      role: "",
    });
  });

  it("rolls back when the callback throws", async () => {
    // A session-level setting (is_local = false) would survive the transaction — unless it is
    // rolled back. No table needed (our init script also takes TEMPORARY away from PUBLIC).
    let pidInside: unknown;
    await expect(
      withTx(actor, async (tx) => {
        pidInside = (await tx.execute<Row>(sql`select pg_backend_pid() as pid`))
          .rows[0]?.pid;
        await tx.execute(
          sql`select set_config('app.rollback_probe', 'written', false)`,
        );
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const after = await withTx(
      actor,
      async (tx) =>
        (
          await tx.execute<Row>(sql`
      select pg_backend_pid() as pid, current_setting('app.rollback_probe', true) as v`)
        ).rows[0],
    );
    expect(after?.pid).toBe(pidInside); // same connection, otherwise this proves nothing
    expect(after?.v ?? "").toBe("");
  });
});

describe("withSystemTx", () => {
  it("connects as horeca_worker and sets no actor", async () => {
    const row = await withSystemTx(
      async (tx) => (await tx.execute<Row>(contextSql)).rows[0],
    );
    expect(row?.login).toBe("horeca_worker");
    expect(row?.orgId ?? "").toBe("");
  });
});
