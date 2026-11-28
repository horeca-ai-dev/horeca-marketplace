/**
 * resolveActor() — session → Actor, for Server Components and Server Actions (D2-B3).
 *
 *   anonymous         no valid session                     → login page
 *   no-organization   logged in, member of no usable org   → "Complete company setup"
 *   actor             logged in + verified member          → normal app
 *
 * The organization is the one the session names, when the user is (still) a member of it; otherwise the
 * user's oldest usable membership (loadActorForSession, D7-A3) — so a refused switch, a removed membership
 * or an old session never strands somebody who has a company on "Complete company setup".
 *
 * `cache()` makes it run once per request even when a layout, a page and an action all ask.
 * Lives outside src/server/domain because it uses Next.js (headers) and Better Auth.
 */
import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { getAuth } from "@/server/auth/auth";
import { loadActorForSession } from "@/server/db/queries/actor";
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
  // Never trust the session's organization on its own: membership is re-checked in the database, and a
  // missing or stale organization falls back to the user's oldest usable membership.
  const loaded = await loadActorForSession(
    userId,
    session.session.activeOrganizationId ?? null,
  );
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
