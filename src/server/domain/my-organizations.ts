/**
 * `listMyOrganizations` — the organizations the current user belongs to, for the organization switcher
 * (D7-A3; issue #63; matrix: org.switchActive — listing exists only so the user can switch).
 *
 * Takes NO input: the user is `actor.userId`, from the session (rule 3). It answers with the organizations of
 * that user and nothing else, so it can never list another user's or another tenant's organizations.
 *
 * How it stays safe under RLS: `member` (Better Auth's table, no RLS) is filtered by the user explicitly, and
 * the profile — type and legal name — is read through org_profiles, whose policy `org_profiles_read_member`
 * (migration 0007) lets a member see the profile of every organization they belong to, not only the active
 * one. Without that policy this query would return the active organization alone.
 *
 * Same rules as `loadActor` (src/server/db/queries/actor.ts): a membership whose organization has no profile
 * yet (registration unfinished) or whose role is not one we know is left out. The order is the one of
 * `defaultOrganizationId` — oldest membership first — so the list and "where a new session starts" agree.
 *
 * Switching itself is Better Auth's `/organization/set-active` (allowlisted in auth.ts; membership is checked
 * there and re-checked by `resolveActor` on the next request) — there is no Server Action for it.
 */
import { asc, eq } from "drizzle-orm";
import { warnIfEmptyRead } from "@/server/db/rls-debug";
import { member, orgProfiles } from "@/server/db/schema";
import type { Tx } from "@/server/db/tx";
import { getLogger } from "@/server/logger";
import { isMemberRole, isOrgType, type Actor, type OrgType } from "./actor";
import { assertCan } from "./policy";

const log = getLogger("my-organizations");

export type MyOrganization = {
  organizationId: string;
  type: OrgType;
  legalName: string;
  /** The organization the actor is acting for right now. */
  active: boolean;
};

export async function listMyOrganizations(
  tx: Tx,
  actor: Actor,
): Promise<MyOrganization[]> {
  assertCan(actor, "org.switchActive");

  const rows = warnIfEmptyRead(
    log,
    actor,
    "org.listMine",
    await tx
      .select({
        organizationId: member.organizationId,
        role: member.role,
        type: orgProfiles.type,
        legalName: orgProfiles.legalName,
      })
      .from(member)
      // Inner join: an organization without a profile is not offered.
      .innerJoin(
        orgProfiles,
        eq(orgProfiles.organizationId, member.organizationId),
      )
      .where(eq(member.userId, actor.userId))
      .orderBy(asc(member.createdAt), asc(member.id)),
  );

  return rows.flatMap((row) =>
    isMemberRole(row.role) && isOrgType(row.type)
      ? [
          {
            organizationId: row.organizationId,
            type: row.type,
            legalName: row.legalName,
            active: row.organizationId === actor.orgId,
          },
        ]
      : [],
  );
}
