/**
 * Worker entry point (D2-B4) — `pnpm worker:dev` locally, the `worker` container on the server.
 *
 * Connects as horeca_worker for pg-boss (fetch / complete / maintenance / cron). Processors open
 * withSystemTx() for system work, or withTx(actor) for jobs that act for a user (CSV import).
 *
 * Every processor: parse the payload with its Zod schema (untrusted!), re-read rows by id, re-check
 * state, be idempotent (pg-boss may deliver a job twice after a crash).
 */
import type { Job } from "pg-boss";
import { closeDb } from "@/server/db/client";
import { closeEmail } from "@/server/email/send";
import { createWorkerBoss } from "@/server/jobs/boss";
import { queues, type Payload, type QueueName } from "@/server/jobs/queues";

const boss = createWorkerBoss();
boss.on("error", (err) => console.error("[worker] pg-boss:", err.message));

/**
 * Registers one processor. A payload that fails its schema throws → the job fails; pg-boss retries
 * it (default retryLimit 2) and then leaves it in state "failed", where we can inspect it.
 */
async function handle<Q extends QueueName>(
  queue: Q,
  processor: (data: Payload<Q>, job: Job<unknown>) => Promise<void>,
) {
  await boss.work(queue, async ([job]) => {
    if (!job) return;
    const parsed = queues[queue].safeParse(job.data);
    if (!parsed.success)
      throw new Error(`invalid payload for ${queue}: ${parsed.error.message}`);
    await processor(parsed.data as Payload<Q>, job);
  });
}

async function main() {
  await boss.start();

  await handle("email.send", async (data, job) => {
    // sendEmail() (src/server/email/send.ts) is ready; the templates that turn (template, id) into
    // recipient + subject + body arrive with D6-B3 (React Email). Until then the job is only logged.
    console.log(
      `[worker] email.send ${data.template} for ${data.id} (job ${job.id}) — not sent yet`,
    );
  });

  console.log("[worker] started");
}

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] ${signal}: finishing active jobs…`);
  await boss.stop({ graceful: true, timeout: 30_000 });
  await closeDb();
  closeEmail();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

main().catch((err: unknown) => {
  console.error("[worker] failed to start:", err);
  process.exit(1);
});
