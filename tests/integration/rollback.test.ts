/**
 * A failure inside a transaction leaves NOTHING behind (D3-B1; CLAUDE.md testing rules: "keep the
 * transaction-rollback test"). The checkout will reuse the same guarantee — this test proves it for
 * `withTx` itself, with two kinds of failure: an exception in our code and a rejected statement.
 *
 * Fixture: the `organization` table (no RLS, the web login may insert and delete there).
 */
import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { organization } from "@/server/db/schema";
import { withSystemTx, withTx, type RlsContext } from "@/server/db/tx";

const actor: RlsContext = {
  userId: "rollback_user",
  orgId: "rollback_org",
  orgType: "buyer",
  role: "owner",
};
const run = randomBytes(4).toString("hex");
const ids: string[] = [];

function newOrg(label: string) {
  const id = `rb_${label}_${run}`;
  ids.push(id);
  return { id, name: label, slug: id, createdAt: new Date() };
}

/** Reads through a different login and connection: only committed rows are visible. */
const exists = (id: string) =>
  withSystemTx(async (tx) => {
    const rows = await tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, id));
    return rows.length > 0;
  });

afterAll(async () => {
  await withTx(actor, (tx) =>
    tx.delete(organization).where(inArray(organization.id, ids)),
  );
  await closeDb();
});

describe("withTx rollback", () => {
  it("commits when the function returns (so the tests below prove something)", async () => {
    const row = newOrg("commit");
    await withTx(actor, (tx) => tx.insert(organization).values(row));
    expect(await exists(row.id)).toBe(true);
  });

  it("leaves nothing behind when our code throws after an insert", async () => {
    const row = newOrg("throw");
    await expect(
      withTx(actor, async (tx) => {
        await tx.insert(organization).values(row);
        throw new Error("forced failure after the insert");
      }),
    ).rejects.toThrow("forced failure");
    expect(await exists(row.id)).toBe(false);
  });

  it("leaves nothing behind when a later statement is rejected by the database", async () => {
    const first = newOrg("first");
    const clash = { ...newOrg("second"), slug: first.slug }; // same slug → unique violation
    await expect(
      withTx(actor, async (tx) => {
        await tx.insert(organization).values(first);
        await tx.insert(organization).values(clash);
      }),
    ).rejects.toThrow();
    expect(await exists(first.id)).toBe(false);
    expect(await exists(clash.id)).toBe(false);
  });
});
