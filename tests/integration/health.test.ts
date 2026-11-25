/**
 * /api/health database checks against a real, migrated Postgres (D2-A4). Proves the two grants the
 * health check relies on: migration 0002 (drizzle.__drizzle_migrations) and the `state` column grant in
 * pgboss-grants.ts — both read as horeca_app with no RLS context.
 */
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import {
  migrationState,
  oldestWaitingJobAgeSeconds,
} from "@/server/db/queries/health";
import { healthReport } from "@/server/health";

afterAll(async () => {
  await closeDb();
});

describe("health checks (horeca_app, no RLS context)", () => {
  it("sees the migrations at the version bundled with the code", async () => {
    await expect(migrationState()).resolves.toBe("ok");
  });

  it("can read pg-boss job ages", async () => {
    const age = await oldestWaitingJobAgeSeconds();
    expect(age).toBeGreaterThanOrEqual(0);
  });

  it("reports the database as healthy (200) whatever the optional services do", async () => {
    const report = await healthReport();
    expect(report.checks.database).toBe("ok");
    expect(report.checks.migrations).toBe("ok");
    expect(report.status).not.toBe("down");
    expect(report.checks.worker).not.toBe("unknown");
  });
});
