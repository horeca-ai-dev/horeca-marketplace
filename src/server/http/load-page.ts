/**
 * loadPage() — runs a page's data read and turns a typed domain error into what the user should see
 * (D4-A2, CLAUDE.md rules 6 and 16). Every Server Component page that calls a domain query uses it:
 *
 *   const result = await loadPage(() => withTx(actor, (tx) => getOrder(tx, actor, { id })));
 *   if (!result.ok) return <ForbiddenPage area="buyer" />;
 *   const order = result.data;
 *
 *   NotFound        → notFound()      the segment's not-found.tsx, HTTP 404
 *   Unauthenticated → redirect to /login
 *   Forbidden       → { ok: false }   the page renders <ForbiddenPage> in place (calm text + next
 *                                     action). HTTP status stays 200: a real 403 page needs Next's
 *                                     experimental `authInterrupts`, which we do not enable.
 *   Conflict        → rethrown with a digest → error.tsx shows the reason's text
 *   Validation      → rethrown with a digest → error.tsx
 *   anything else   → rethrown unchanged      → error.tsx's generic text (logged by Next)
 *
 * Pages cannot answer 409 / 422: those statuses exist in Server Action results (safe-action.ts) and
 * in route handlers (problem+json). A page only meets them when a read finds its data in a state it
 * cannot show — rare, so the error boundary is enough.
 */
import "server-only";
import { notFound, redirect } from "next/navigation";
import { encodePageErrorDigest } from "@/lib/page-error-digest";
import {
  Conflict,
  Forbidden,
  NotFound,
  Unauthenticated,
  Validation,
} from "@/server/domain/errors";
import { getLogger } from "@/server/logger";

const log = getLogger("page");

export type PageResult<T> = { ok: true; data: T } | { ok: false };

/** An error whose digest Next.js passes to error.tsx unchanged (see page-error-digest.ts). */
class PageError extends Error {
  constructor(readonly digest: string) {
    super(digest);
    this.name = "PageError";
  }
}

export async function loadPage<T>(
  load: () => Promise<T>,
): Promise<PageResult<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    if (error instanceof NotFound) notFound();
    if (error instanceof Unauthenticated) redirect("/login");
    if (error instanceof Forbidden) return { ok: false };
    if (error instanceof Conflict) {
      log.warn({ reason: error.reason }, "conflict while rendering a page");
      throw new PageError(
        encodePageErrorDigest({ code: "CONFLICT", reason: error.reason }),
      );
    }
    if (error instanceof Validation) {
      log.warn("validation error while rendering a page");
      throw new PageError(encodePageErrorDigest({ code: "VALIDATION" }));
    }
    throw error;
  }
}
