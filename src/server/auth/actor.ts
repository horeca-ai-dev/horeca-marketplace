/**
 * resolveActor() — session → Actor, for Server Components and Server Actions (D2-B3).
 *
 *   anonymous         no valid session                     → login page
 *   no-organization   logged in, no (valid) active org     → "Complete company setup"
 *   actor             logged in + verified member          → normal app
 *
 * `cache()` makes it run once per request even when a layout, a page and an action all ask.
 * Lives outside src/server/domain because it uses Next.js (headers) and Better Auth.
 */
import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { getAuth } from "@/server/auth/auth";
import { loadActor } from "@/server/db/queries/actor";
import type { Actor } from "@/server/domain/actor";
import { Unauthenticated } from "@/server/domain/errors";

export type SessionState =
  | { kind: "anonymous" }
  | { kind: "no-organization"; userId: string }
  /** orgName: the company's legal name, for the header only (never for authorization). */
  | { kind: "actor"; actor: Actor; orgName: string };

export const resolveSession = cache(async (): Promise<SessionState> => {
  // headers() first: it marks the page as dynamic before anything else runs. (getAuth() reads env,
  // and `next build` has none — called first, the build would try to prerender the page and fail.)
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return { kind: "anonymous" };

  const userId = session.user.id;
  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) return { kind: "no-organization", userId };

  // Never trust the session's organization on its own: re-check membership in the database.
  const loaded = await loadActor(userId, organizationId);
  return loaded
    ? { kind: "actor", ...loaded }
    : { kind: "no-organization", userId };
});

/** For Server Actions and pages that need a full actor. Throws Unauthenticated otherwise. */
export async function resolveActor(): Promise<Actor> {
  const state = await resolveSession();
  if (state.kind !== "actor") throw new Unauthenticated();
  return state.actor;
}
