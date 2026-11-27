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
 */
import { and, eq } from "drizzle-orm";
import { isMemberRole, isOrgType, type Actor } from "@/server/domain/actor";
import { member, orgProfiles } from "@/server/db/schema";
import { setRlsContext, withUserTx } from "@/server/db/tx";

export async function loadActor(
  userId: string,
  organizationId: string,
): Promise<{ actor: Actor; orgName: string } | null> {
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
