/**
 * Typed domain errors (D2-B3, CLAUDE.md rules 6 and 16).
 *
 * Domain code throws these; the edges translate them:
 *   Server Actions → { code, message, fieldErrors? }   (src/server/actions/safe-action.ts)
 *   route handlers → application/problem+json with `status`
 *
 * Which one to throw (permission-matrix.md):
 *   another organization's resource or area      → NotFound (404, never 403 — do not reveal it exists)
 *   own organization's resource, role may not    → Forbidden (403)
 *   own resource in the wrong status             → Conflict (409) with a message the user can read
 *   invalid input                                → Validation (422) with field errors
 *
 * Messages are shown to the user: plain words, no internal IDs, no SQL.
 */
export type DomainErrorCode =
  "UNAUTHENTICATED" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "VALIDATION";

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;
  abstract readonly status: 401 | 403 | 404 | 409 | 422;
}

/** No session, or the session has no valid organization. Not in the matrix — it is the auth layer's. */
export class Unauthenticated extends DomainError {
  readonly code = "UNAUTHENTICATED";
  readonly status = 401;
  constructor(message = "Please log in.") {
    super(message);
    this.name = "Unauthenticated";
  }
}

export class NotFound extends DomainError {
  readonly code = "NOT_FOUND";
  readonly status = 404;
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFound";
  }
}

export class Forbidden extends DomainError {
  readonly code = "FORBIDDEN";
  readonly status = 403;
  constructor(message = "You are not allowed to do this.") {
    super(message);
    this.name = "Forbidden";
  }
}

/**
 * A stable, machine-readable cause of a 409, for the client to branch on (a field to mark, a redirect)
 * without matching the English message. Add a value only when a client has to react differently to it.
 */
export const CONFLICT_REASONS = [
  "TAX_ID_TAKEN",
  "EMAIL_TAKEN",
  "ALREADY_HAS_COMPANY",
  "SKU_TAKEN",
  "DEFAULT_LOCATION_ARCHIVE",
] as const;
export type ConflictReason = (typeof CONFLICT_REASONS)[number];

export class Conflict extends DomainError {
  readonly code = "CONFLICT";
  readonly status = 409;
  readonly reason?: ConflictReason;
  constructor(message: string, options?: { reason?: ConflictReason }) {
    super(message);
    this.name = "Conflict";
    this.reason = options?.reason;
  }
}

export type FieldErrors = Record<string, string[]>;

export class Validation extends DomainError {
  readonly code = "VALIDATION";
  readonly status = 422;
  constructor(
    message = "Please check the highlighted fields.",
    readonly fieldErrors: FieldErrors = {},
  ) {
    super(message);
    this.name = "Validation";
  }
}
