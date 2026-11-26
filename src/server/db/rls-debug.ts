/**
 * Development aid for RLS (D4-B2, ADR 014).
 *
 * RLS hides rows silently: a query that "finds nothing" looks the same whether the data is missing or
 * the policy filtered it out (wrong organization, missing context, wrong role). With APP_ENV=local this
 * helper logs the RLS context next to a read that returned no rows, so the cause is one glance away.
 * On staging and production it does nothing: empty reads are normal there and the line carries user
 * and organization ids.
 *
 *   const rows = await tx.select().from(products).where(...);
 *   return warnIfEmptyRead(log, actor, "products.list", rows);   // returns `rows` unchanged
 */
import { env } from "@/env.core";
import type { Logger } from "@/server/logger";
import type { RlsContext } from "./tx";

export function warnIfEmptyRead<T>(
  log: Logger,
  ctx: Partial<RlsContext> | null,
  label: string,
  rows: readonly T[],
  appEnv: "local" | "staging" | "production" = env.APP_ENV,
): readonly T[] {
  if (appEnv === "local" && rows.length === 0) {
    log.warn(
      {
        read: label,
        // Spelled out key by key: only these four values, never a whole object.
        rlsContext: {
          userId: ctx?.userId ?? null,
          orgId: ctx?.orgId ?? null,
          orgType: ctx?.orgType ?? null,
          role: ctx?.role ?? null,
        },
      },
      "empty read under RLS: no rows for this context — check the policy and the context if you expected some",
    );
  }
  return rows;
}
