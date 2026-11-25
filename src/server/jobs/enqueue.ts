/**
 * enqueue(tx, queue, payload) — put a job in the queue INSIDE the caller's transaction (D2-B4, rule 11).
 *
 * The job row is inserted by `tx`, not by a separate connection, so it exists exactly when the data
 * commits: if the transaction rolls back (an error, a failed check), the job is gone too and no
 * e-mail goes out for an order that was never saved. Tested in tests/integration/enqueue.test.ts.
 *
 * pg-boss 12 ships an adapter for this: fromDrizzle(tx, sql) turns a Drizzle transaction into the
 * `db` option of send().
 */
import { sql } from "drizzle-orm";
import { fromDrizzle, type SendOptions } from "pg-boss";
import type { Tx } from "@/server/db/tx";
import { webBoss } from "./boss";
import { queues, type Payload, type QueueName } from "./queues";

/** Options callers may set. `db` is always the transaction, so it is not offered. */
export type EnqueueOptions = Pick<
  SendOptions,
  "startAfter" | "singletonKey" | "retryLimit" | "retryDelay" | "priority"
>;

/** Returns the job id, or null when a job with the same `singletonKey` is already waiting. */
export async function enqueue<Q extends QueueName>(
  tx: Tx,
  queue: Q,
  payload: Payload<Q>,
  options: EnqueueOptions = {},
): Promise<string | null> {
  // Validate here too: a typo in a payload should fail the transaction now, not the job later.
  const data = queues[queue].parse(payload);
  const boss = await webBoss();
  return boss.send(queue, data, { ...options, db: fromDrizzle(tx, sql) });
}
