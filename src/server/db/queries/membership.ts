/**
 * Membership lookups on Better Auth's `member` table (D2-B2).
 *
 * `member` has no RLS (Better Auth's own table, decision 9), so every query here filters by the user
 * explicitly. Runs through withUserTx like every other database access (CLAUDE.md rule 2).
 */
import { asc, eq } from "drizzle-orm";
import { member } from "@/server/db/schema";
import { withUserTx } from "@/server/db/tx";

/**
 * The organization a new session should start in: the user's oldest membership, or null for a user
 * without an organization (who then lands on "Complete company setup"). In the MVP a user belongs to
 * exactly one organization.
 */
export async function defaultOrganizationId(
  userId: string,
): Promise<string | null> {
  return withUserTx(userId, async (tx) => {
    const [row] = await tx
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.userId, userId))
      .orderBy(asc(member.createdAt))
      .limit(1);
    return row?.organizationId ?? null;
  });
}
