/** Column helpers shared by the schema drafts. */
import { bigint, customType, timestamp } from "drizzle-orm/pg-core";

/**
 * Money: integer cents (EUR) in a Postgres `bigint` (CLAUDE.md rule 7). mode "number" maps it to a JS number,
 * exact up to 2^53 cents (≈ 90 trillion EUR) and serialisable by Server Actions without BigInt handling.
 * All arithmetic still happens only in `src/server/domain/money.ts`.
 */
export const cents = (name: string) => bigint(name, { mode: "number" });

/** Postgres `ltree` (extension). Drizzle has no built-in type — verify in docs if one appears. */
export const ltree = customType<{ data: string }>({ dataType: () => "ltree" });

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
