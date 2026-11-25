/** Column helpers shared by our own schema files. */
import { bigint, customType } from "drizzle-orm/pg-core";

/**
 * Money: integer cents (EUR) in a Postgres `bigint` (CLAUDE.md rule 7). `mode: "number"` maps it to a
 * JS number — exact up to 2^53 cents and serialisable by Server Actions without BigInt handling.
 * All arithmetic still happens only in `src/server/domain/money.ts`.
 */
export const cents = (name: string) => bigint(name, { mode: "number" });

/** Postgres `ltree` (extension created by migration 0000). Drizzle has no built-in type for it. */
export const ltree = customType<{ data: string }>({
  dataType: () => "ltree",
});
