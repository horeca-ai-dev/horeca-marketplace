/**
 * Transaction helpers — the ONLY way code reaches the database (D2-B1, CLAUDE.md rule 2).
 *
 *   withTx(actor, fn)     a user is acting          → horeca_app,    RLS context = the actor
 *   withUserTx(userId, fn) logged in, no organization yet (registration, "Complete company setup")
 *   withSystemTx(fn)      a worker job acting for no user → horeca_worker (worker process only)
 *
 * The RLS context is set with `set_config(…, true)`: the `true` means "local to this transaction".
 * When the transaction ends the values are gone, so a pooled connection never carries the previous
 * request's user into the next one. No context → the SQL helpers app.org_id() etc. return NULL →
 * policies match zero rows (fail closed). Policies themselves arrive on D4.
 */
import { sql } from "drizzle-orm";
import { appDb, workerDb, type Tx } from "./client";

export type { Tx };

/** What RLS needs to know. The domain `Actor` (src/server/domain/actor.ts) has exactly this shape. */
export type RlsContext = {
  userId: string;
  orgId: string;
  orgType: "buyer" | "supplier" | "platform";
  role: "owner" | "member";
};

/**
 * Sets (part of) the RLS context inside an open transaction. Values are bound parameters, never
 * concatenated into SQL. Keys left out stay unset (= NULL for the policies).
 *
 * Normally called by the helpers below. Call it directly only in the registration transaction, which
 * switches from "user without organization" to "owner of the organization just inserted".
 */
export async function setRlsContext(
  tx: Tx,
  ctx: Partial<RlsContext>,
): Promise<void> {
  await tx.execute(sql`
    select
      set_config('app.user_id',  ${ctx.userId ?? ""},  true),
      set_config('app.org_id',   ${ctx.orgId ?? ""},   true),
      set_config('app.org_type', ${ctx.orgType ?? ""}, true),
      set_config('app.role',     ${ctx.role ?? ""},    true)
  `);
}

/** A user acting for their organization. Every Server Action / Server Component read uses this. */
export async function withTx<T>(
  actor: RlsContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return appDb().transaction(async (tx) => {
    await setRlsContext(tx, actor);
    return fn(tx);
  });
}

/** A logged-in user who has no organization yet: only app.user_id is set. */
export async function withUserTx<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return appDb().transaction(async (tx) => {
    await setRlsContext(tx, { userId });
    return fn(tx);
  });
}

/**
 * A worker job that acts for nobody (search sync, PDF, e-mail, image sizes). Runs as horeca_worker,
 * whose grants and policies allow exactly what those jobs need. Sets no app.* context on purpose:
 * there is no "system" flag (rejected in decision 9 — any web code could set it).
 */
export async function withSystemTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return workerDb().transaction(fn);
}
