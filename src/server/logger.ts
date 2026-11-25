/**
 * Logging (D3-B3) — pino, JSON lines on stdout in every environment. Docker collects stdout (with log
 * rotation, see the Compose files); nothing in the app writes log files.
 *
 *   const log = getLogger("worker");
 *   log.info({ jobId }, "email.send started");
 *   log.error({ err }, "unexpected error");      // always the key `err`: it gets the safe serializer
 *
 * Rules (CLAUDE.md rule 16 and "Security rules"):
 *   - never log secrets, tokens, cookies or card data — the redact list below blanks the usual field
 *     names, but the real protection is to not put them into a log call in the first place
 *   - never log a whole request or session object
 *   - the level comes from LOG_LEVEL (src/env.core.ts)
 *
 * Plain JSON on purpose: no `pino-pretty` transport (a worker thread that the Next.js bundler does not
 * like). For readable output locally pipe it: `pnpm worker:dev | pnpm dlx pino-pretty`.
 */
import pino, { type DestinationStream, type Logger } from "pino";
import { env } from "@/env.core";

export type { Logger };

/** Field names that are blanked wherever they appear at the top level, one level down, or in req.headers. */
const SENSITIVE = [
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "cookie",
  "authorization",
  "secret",
  "cardNumber",
  "cvc",
  "cvv",
];

export const REDACT_PATHS = [
  ...SENSITIVE,
  ...SENSITIVE.map((key) => `*.${key}`),
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie",
];

type SerializedError = {
  message?: string;
  stack?: string;
  cause?: SerializedError;
  [key: string]: unknown;
};

/**
 * Drizzle's query errors put the bound parameter VALUES into the message (`Failed query: … params: a,b`):
 * e-mail addresses, names, password hashes. Cut everything after `params:` — in the message, in the stack
 * and in every `cause`, and drop the `params` array property that holds the same values. The SQL text
 * itself stays: it is what you need to debug.
 */
function scrub(value: string | undefined): string | undefined {
  return value?.replace(/(\nparams:)[\s\S]*/, "$1 [omitted]");
}

function scrubError(error: SerializedError): SerializedError {
  const out: SerializedError = { ...error };
  // The same values also sit in an own property `params` (array) of Drizzle's DrizzleQueryError.
  delete out.params;
  if (out.message !== undefined) out.message = scrub(out.message);
  if (out.stack !== undefined) out.stack = scrub(out.stack);
  if (out.cause) out.cause = scrubError(out.cause);
  return out;
}

/** The serializer behind `{ err }`: pino's standard one (follows `cause`), then scrubbed. */
export function serializeError(error: unknown): SerializedError {
  return scrubError(
    pino.stdSerializers.errWithCause(error as Error) as SerializedError,
  );
}

/** Builds a logger; tests pass their own destination to read what was written. */
export function createLogger(options: {
  level: string;
  destination?: DestinationStream;
}): Logger {
  return pino(
    {
      level: options.level,
      redact: { paths: REDACT_PATHS, censor: "[redacted]" },
      serializers: { err: serializeError },
      // "level":"info" instead of 30 — readable without a tool.
      formatters: { level: (label) => ({ level: label }) },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    options.destination,
  );
}

/** The process-wide logger. LOG_LEVEL has a default, so importing this never needs a full environment. */
export const logger = createLogger({ level: env.LOG_LEVEL });

/** A logger that stamps every line with `component` (e.g. "worker", "migrate", "action"). */
export function getLogger(component: string): Logger {
  return logger.child({ component });
}
