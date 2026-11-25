/**
 * THROWAWAY (G0 check) — delete together with src/app/g0-check after gate G0.
 *
 * The smallest possible domain function, written the way every real one is: (tx, actor, input),
 * policy check first, then queries on `tx` only. It reports what the database sees, which proves
 * that the session → actor → withTx() → RLS context chain works on the real server.
 */
import { sql } from "drizzle-orm";
import type { Tx } from "@/server/db/tx";
import type { Actor } from "./actor";
import { assertCan } from "./policy";

export type PingResult = {
  login: string;
  orgId: string;
  orgType: string;
  role: string;
  note: string;
  at: string;
};

export async function ping(
  tx: Tx,
  actor: Actor,
  input: { note: string },
): Promise<PingResult> {
  assertCan(actor, "g0.ping");
  const result = await tx.execute<{
    login: string;
    org_id: string;
    org_type: string;
    role: string;
    at: string;
  }>(sql`
    select current_user                              as login,
           current_setting('app.org_id', true)       as org_id,
           current_setting('app.org_type', true)     as org_type,
           current_setting('app.role', true)         as role,
           to_char(now(), 'YYYY-MM-DD HH24:MI:SS')   as at`);
  const row = result.rows[0]!;
  return {
    login: row.login,
    orgId: row.org_id,
    orgType: row.org_type,
    role: row.role,
    note: input.note,
    at: row.at,
  };
}
