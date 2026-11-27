/**
 * Carries a domain error's code from a Server Component to error.tsx (D4-A2).
 *
 * Why a digest: in production Next.js replaces a Server Component error with a generic message before
 * it reaches the error boundary — `name`, `message` and our `code` are gone; only `error.digest`
 * survives. Next keeps a digest that the thrown error already has ("respect the original digest" in
 * next/dist/server/app-render/create-error-handler.js — internal behaviour, checked on 16.4.6), so
 * loadPage() sets one of these and error.tsx decodes it. Anything else decodes as UNEXPECTED.
 *
 * Only a code and a reason from a fixed list travel this way — never a message or an ID.
 * Shared by the server (encode) and the client error boundary (decode): no server imports.
 */
import { CONFLICT_REASONS, type ConflictReason } from "@/server/domain/errors";

const PREFIX = "horeca:";

export type PageErrorKind =
  | { code: "CONFLICT"; reason?: ConflictReason }
  | { code: "VALIDATION" }
  | { code: "UNEXPECTED" };

export function encodePageErrorDigest(
  kind: Exclude<PageErrorKind, { code: "UNEXPECTED" }>,
): string {
  if (kind.code === "CONFLICT" && kind.reason)
    return `${PREFIX}CONFLICT:${kind.reason}`;
  return `${PREFIX}${kind.code}`;
}

export function decodePageErrorDigest(
  digest: string | undefined,
): PageErrorKind {
  if (!digest?.startsWith(PREFIX)) return { code: "UNEXPECTED" };
  const [code, reason] = digest.slice(PREFIX.length).split(":");
  if (code === "VALIDATION" && reason === undefined)
    return { code: "VALIDATION" };
  if (code === "CONFLICT") {
    if (reason === undefined) return { code: "CONFLICT" };
    const known = CONFLICT_REASONS.find((r) => r === reason);
    return known ? { code: "CONFLICT", reason: known } : { code: "CONFLICT" };
  }
  return { code: "UNEXPECTED" };
}
