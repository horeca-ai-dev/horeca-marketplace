/**
 * Health report for /api/health (D2-A4, README → Operations).
 *
 * Gates deploys on PostgreSQL + migration version ONLY. Meilisearch, Mailpit (SMTP), Garage (media storage,
 * decision 013) and the worker are reported as "degraded", never blocking: search, e-mail and images can be
 * down for a minute without the app being broken, and a deploy must not stall on them (Garage is also
 * "degraded" on a fresh environment until scripts/garage-setup.sh has run).
 *
 * Every external check has a 2 s timeout (the deploy script polls this endpoint). The response carries
 * states only — no error messages, hosts or versions (CLAUDE.md rule 16); details go to the log.
 */
import { connect } from "node:net";
import { env } from "@/env.core";
import { getLogger } from "@/server/logger";
import { storage } from "@/server/storage";
import {
  migrationState,
  oldestWaitingJobAgeSeconds,
  type MigrationState,
} from "@/server/db/queries/health";

const log = getLogger("health");
const TIMEOUT_MS = 2_000;
/** The worker counts as degraded when a due job has waited longer than this (CLAUDE.md "Health"). */
export const WORKER_STALE_SECONDS = 5 * 60;

type Optional = "ok" | "degraded" | "unknown";

export type HealthReport = {
  status: "ok" | "degraded" | "down";
  checks: {
    database: "ok" | "down";
    migrations: MigrationState | "unknown";
    search: Optional;
    mail: Optional;
    storage: Optional;
    worker: Optional;
  };
};

async function withTimeout<T>(
  promise: Promise<T>,
  ms = TIMEOUT_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${ms} ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function logFailure(check: string, err: unknown) {
  log.error({ err, check }, "health check failed");
}

async function checkDatabase(): Promise<
  Pick<HealthReport["checks"], "database" | "migrations">
> {
  try {
    return {
      database: "ok",
      migrations: await withTimeout(migrationState(), 3_000),
    };
  } catch (err) {
    logFailure("database", err);
    return { database: "down", migrations: "unknown" };
  }
}

async function checkSearch(): Promise<Optional> {
  if (!env.has("MEILI_HOST")) return "unknown";
  try {
    const res = await fetch(new URL("/health", env.MEILI_HOST), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return res.ok ? "ok" : "degraded";
  } catch (err) {
    logFailure("search", err);
    return "degraded";
  }
}

/** Mailpit: can we open a TCP connection to the SMTP port? (The web process never sends mail itself.) */
async function checkMail(): Promise<Optional> {
  if (!env.has("SMTP_URL")) return "unknown";
  const url = new URL(env.SMTP_URL);
  const port = Number(url.port || (url.protocol === "smtps:" ? 465 : 25));
  return new Promise((resolve) => {
    const socket = connect({ host: url.hostname, port });
    const done = (state: Optional) => {
      socket.destroy();
      resolve(state);
    };
    socket.setTimeout(TIMEOUT_MS, () => {
      logFailure("mail", "timed out");
      done("degraded");
    });
    socket.once("connect", () => done("ok"));
    socket.once("error", (err) => {
      logFailure("mail", err);
      done("degraded");
    });
  });
}

/** Garage: HeadBucket with our key (the storage module's ping, 2 s timeout). Never blocks a deploy. */
async function checkStorage(): Promise<Optional> {
  if (!env.has("S3_ENDPOINT")) return "unknown";
  try {
    await withTimeout(storage.ping());
    return "ok";
  } catch (err) {
    logFailure("storage", err);
    return "degraded";
  }
}

/** No heartbeat store: the worker is "degraded" when the oldest due job has waited > 5 minutes. */
async function checkWorker(): Promise<Optional> {
  try {
    const age = await withTimeout(oldestWaitingJobAgeSeconds(), 3_000);
    return age > WORKER_STALE_SECONDS ? "degraded" : "ok";
  } catch (err) {
    logFailure("worker", err);
    return "unknown";
  }
}

export async function healthReport(): Promise<HealthReport> {
  const [db, search, mail, storageState, worker] = await Promise.all([
    checkDatabase(),
    checkSearch(),
    checkMail(),
    checkStorage(),
    checkWorker(),
  ]);
  const checks = { ...db, search, mail, storage: storageState, worker };
  const blocking = db.database !== "ok" || db.migrations !== "ok";
  const degraded = [search, mail, storageState, worker].some((s) => s !== "ok");
  return {
    status: blocking ? "down" : degraded ? "degraded" : "ok",
    checks,
  };
}
