/**
 * enqueue(tx, …) and the pg-boss grants against a real database (D2-B4).
 * Needs the migrate entry to have run (it installs the pgboss schema and the grants).
 *
 * The key test of the task: a rolled-back transaction leaves no job.
 */
import { sql } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/env.core";
import { closeDb } from "@/server/db/client";
import { withSystemTx, withTx, type RlsContext } from "@/server/db/tx";
import { stopWebBoss } from "@/server/jobs/boss";
import { enqueue } from "@/server/jobs/enqueue";

const actor: RlsContext = {
  userId: "user_1",
  orgId: "org_1",
  orgType: "buyer",
  role: "owner",
};
const marker = () =>
  `job-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Read the queue as the worker would (horeca_worker), never as the owner: this also proves its grants.
let worker: PgBoss;
beforeAll(async () => {
  worker = new PgBoss({
    connectionString: env.DATABASE_WORKER_URL,
    migrate: false,
    supervise: false,
    schedule: false,
  });
  await worker.start();
});

afterAll(async () => {
  await worker.stop({ graceful: false });
  await stopWebBoss();
  await closeDb();
});

async function jobsWithId(id: string): Promise<number> {
  return withSystemTx(async (tx) => {
    const res = await tx.execute<{ n: number }>(
      sql`select count(*)::int as n from pgboss.job where data->>'id' = ${id}`,
    );
    return res.rows[0]!.n;
  });
}

describe("enqueue(tx, …)", () => {
  it("a committed transaction leaves exactly one job", async () => {
    const id = marker();
    const jobId = await withTx(actor, (tx) =>
      enqueue(tx, "email.send", { template: "order-confirmation", id }),
    );
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await jobsWithId(id)).toBe(1);
  });

  it("a rolled-back transaction leaves NO job", async () => {
    const id = marker();
    await expect(
      withTx(actor, async (tx) => {
        await enqueue(tx, "email.send", { template: "order-confirmation", id });
        throw new Error("checkout failed after enqueue");
      }),
    ).rejects.toThrow("checkout failed after enqueue");
    expect(await jobsWithId(id)).toBe(0);
  });

  it("rejects a payload that does not match the queue's schema (and so rolls back)", async () => {
    await expect(
      withTx(actor, (tx) =>
        // @ts-expect-error — wrong template on purpose
        enqueue(tx, "email.send", { template: "nope", id: "x" }),
      ),
    ).rejects.toThrow();
  });

  it("the worker login can fetch and complete the job", async () => {
    const id = marker();
    await withTx(actor, (tx) =>
      enqueue(tx, "email.send", { template: "password-reset", id }),
    );
    const fetched = await worker.fetch<{ id: string }>("email.send", {
      batchSize: 50,
    });
    const ours = fetched.filter((j) => j.data.id === id);
    expect(ours).toHaveLength(1);
    await worker.complete(
      "email.send",
      fetched.map((j) => j.id),
    );
  });
});

describe("pg-boss grants", () => {
  it("the app login can insert jobs but cannot read their payloads", async () => {
    const client = new pg.Client({ connectionString: env.DATABASE_URL });
    await client.connect();
    try {
      await expect(
        client.query("select data from pgboss.job_common limit 1"),
      ).rejects.toThrow(/permission denied/);
      await expect(
        client.query("delete from pgboss.job_common"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await client.end();
    }
  });

  it("the worker login cannot change the schema", async () => {
    const client = new pg.Client({ connectionString: env.DATABASE_WORKER_URL });
    await client.connect();
    try {
      await expect(
        client.query("drop table pgboss.job_common"),
      ).rejects.toThrow(/must be owner/);
    } finally {
      await client.end();
    }
  });
});
