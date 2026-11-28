/**
 * Builds the Actor for (userId, organizationId) — the "membership re-check" of CLAUDE.md rule 3 (D2-B3).
 *
 * The session only CLAIMS an active organization. On every request we check in the database that the
 * user really is a member of it right now (a removed member must lose access immediately, even with a
 * still-valid session cookie) and read the organization's type.
 *
 * Returns null when the user is not a member, the role is not one we know, or the organization has no
 * profile yet (registration not finished) → the caller treats the user as "no organization".
 *
 * Also returns the company's legal name from the same row, for the header (D5-A2) — it is display
 * data, so it stays outside the Actor that domain functions receive.
 *
 * `loadActorForSession` (D7-A3) is what resolveSession calls: the organization the session names when it
 * is usable, otherwise the user's oldest usable membership.
 */
import { and, asc, eq } from "drizzle-orm";
import { isMemberRole, isOrgType, type Actor } from "@/server/domain/actor";
import { member, orgProfiles } from "@/server/db/schema";
import { setRlsContext, withUserTx } from "@/server/db/tx";
import { getLogger } from "@/server/logger";

const log = getLogger("actor");

export type LoadedActor = { actor: Actor; orgName: string };

export async function loadActor(
  userId: string,
  organizationId: string,
): Promise<LoadedActor | null> {
  return withUserTx(userId, async (tx) => {
    // 1. Membership. `member` is a Better Auth table: no RLS, protected by this explicit filter.
    const [membership] = await tx
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.userId, userId),
          eq(member.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!membership || !isMemberRole(membership.role)) return null;

    // 2. Organization type. org_profiles is under RLS (from D4): its read policy lets an organization
    //    see its own row, so we set app.org_id — now verified by step 1 — before reading it.
    await setRlsContext(tx, {
      userId,
      orgId: organizationId,
      role: membership.role,
    });
    const [profile] = await tx
      .select({ type: orgProfiles.type, legalName: orgProfiles.legalName })
      .from(orgProfiles)
      .where(eq(orgProfiles.organizationId, organizationId))
      .limit(1);
    if (!profile || !isOrgType(profile.type)) return null;

    return {
      actor: {
        userId,
        orgId: organizationId,
        orgType: profile.type,
        role: membership.role,
      },
      orgName: profile.legalName,
    };
  });
}

/**
 * The actor for a session that claims `claimedOrganizationId` (null: the session names none).
 *
 * The claimed organization wins whenever the user really is a member of it. Otherwise — the session names
 * no organization, or one the user no longer belongs to — the user acts for their OLDEST USABLE membership
 * (same order as `listMyOrganizations`: created_at, id; "usable" = what `loadActor` accepts). Only a user
 * with no usable membership at all gets null ("Complete company setup").
 *
 * Why: Better Auth's set-active CLEARS the session's organization when it refuses a switch
 * (tests/integration/org-switch.test.ts), a membership can be removed while a session lives, and a session
 * can come from an older deploy. Without the fallback such a user is sent to /complete-setup, which cannot
 * help somebody who already has a company. The fallback grants nothing new: every candidate goes through
 * `loadActor`, so it is always an organization the user is a member of right now.
 *
 * Nothing is written to the session: the answer is the same on every request until the user switches.
 */
export async function loadActorForSession(
  userId: string,
  claimedOrganizationId: string | null,
): Promise<LoadedActor | null> {
  if (claimedOrganizationId) {
    const claimed = await loadActor(userId, claimedOrganizationId);
    if (claimed) return claimed;
  }

  const memberships = await withUserTx(userId, (tx) =>
    tx
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.userId, userId))
      .orderBy(asc(member.createdAt), asc(member.id)),
  );
  for (const { organizationId } of memberships) {
    if (organizationId === claimedOrganizationId) continue; // already tried above
    const loaded = await loadActor(userId, organizationId);
    if (loaded) {
      log.info(
        { userId, claimedOrganizationId, organizationId },
        "session organization not usable: acting for the oldest usable membership",
      );
      return loaded;
    }
  }
  return null;
}
