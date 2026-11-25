/**
 * Database reads for /api/health (D2-A4). Both run through withAnonymousReadTx (no user, read only).
 */
import { sql } from "drizzle-orm";
import journal from "@/server/db/migrations/meta/_journal.json";
import { withAnonymousReadTx } from "@/server/db/tx";

/**
 * The migration this image expects: the newest entry of the journal bundled at build time. The Drizzle
 * migrator stores that entry's `when` as `created_at` in drizzle.__drizzle_migrations.
 */
const EXPECTED_MIGRATION = journal.entries.at(-1)?.when ?? 0;

export type MigrationState = "ok" | "behind" | "ahead";

/** Throws if Postgres is unreachable. "behind" = migrate has not run; "ahead" = the DB is newer than this image. */
export async function migrationState(): Promise<MigrationState> {
  return withAnonymousReadTx(async (tx) => {
    await tx.execute(sql`set local statement_timeout = 2000`);
    const result = await tx.execute<{ applied: string | null }>(
      sql`select max(created_at)::text as applied from drizzle.__drizzle_migrations`,
    );
    const applied = Number(result.rows[0]?.applied ?? 0);
    if (applied === EXPECTED_MIGRATION) return "ok";
    return applied < EXPECTED_MIGRATION ? "behind" : "ahead";
  });
}

/**
 * Age in seconds of the oldest pg-boss job that is due but not picked up (state created / retry,
 * start_after in the past); 0 when nothing waits. Jobs scheduled for later do not count.
 */
export async function oldestWaitingJobAgeSeconds(): Promise<number> {
  return withAnonymousReadTx(async (tx) => {
    await tx.execute(sql`set local statement_timeout = 2000`);
    const result = await tx.execute<{ age: number | null }>(sql`
      select floor(extract(epoch from now() - min(start_after)))::int as age
      from pgboss.job_common
      where state in ('created', 'retry') and start_after <= now()`);
    return result.rows[0]?.age ?? 0;
  });
}
