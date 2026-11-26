/**
 * `org.register` — creates the user's BUYER organization (D2-B2; APPLIED.md "Registration", matrix row
 * org.register). Registration is for buyers only (decision 012); supplier organizations are created by
 * the platform admin (D5-B1), already approved.
 *
 * Actor: a logged-in user WITHOUT an organization, so this function takes `userId` instead of an
 * Actor (there is no orgId yet). It runs inside the caller's transaction (withUserTx) and does, in
 * this order:
 *   1. refuse if the user already belongs to an organization
 *   2. insert `organization` + `member` (role owner) directly — Better Auth's organization/create is
 *      disabled; ids come from Better Auth's own generator, created_at set by hand (no default)
 *   3. switch the RLS context to the new organization (so the D4 insert policies accept step 4)
 *   4. insert `org_profiles` as an approved buyer
 * Everything or nothing: any error rolls the whole transaction back.
 */
import { generateId } from "@better-auth/core/utils/id";
import { eq } from "drizzle-orm";
import type { CompanyInput } from "@/lib/schemas/registration";
import { member, organization, orgProfiles } from "@/server/db/schema";
import { setRlsContext, type Tx } from "@/server/db/tx";
import { Conflict } from "./errors";

export type RegisteredOrganization = {
  organizationId: string;
  type: "buyer";
  status: "approved";
};

const TAX_ID_UNIQUE = "org_profiles_tax_id_type_uq";

export async function registerOrganization(
  tx: Tx,
  userId: string,
  input: CompanyInput,
): Promise<RegisteredOrganization> {
  // 1.
  const [existing] = await tx
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  if (existing)
    throw new Conflict("This account already belongs to a company.", {
      reason: "ALREADY_HAS_COMPANY",
    });

  // 2.
  const organizationId = generateId();
  const now = new Date();
  await tx.insert(organization).values({
    id: organizationId,
    name: input.legalName,
    slug: `org-${organizationId.toLowerCase()}`,
    createdAt: now,
  });
  await tx.insert(member).values({
    id: generateId(),
    organizationId,
    userId,
    role: "owner",
    createdAt: now,
  });

  // 3.
  await setRlsContext(tx, {
    userId,
    orgId: organizationId,
    orgType: "buyer",
    role: "owner",
  });

  // 4. Every column named explicitly — never spread input into an insert (rule 13).
  try {
    await tx.insert(orgProfiles).values({
      organizationId,
      type: "buyer",
      status: "approved",
      legalName: input.legalName,
      taxId: input.taxId,
      vatNumber: input.vatNumber ?? null,
      addressLine: input.addressLine,
      city: input.city,
      postalCode: input.postalCode,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone ?? null,
    });
  } catch (error) {
    if (isUniqueViolation(error, TAX_ID_UNIQUE)) {
      throw new Conflict(
        "A buyer with this tax ID (PIB) is already registered.",
        { reason: "TAX_ID_TAKEN" },
      );
    }
    throw error;
  }
  return { organizationId, type: "buyer", status: "approved" };
}

/** Postgres unique_violation (23505) on the given constraint; Drizzle wraps the driver error in `cause`. */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  const cause = (
    error as { cause?: { code?: string; constraint?: string } } | null
  )?.cause;
  return cause?.code === "23505" && cause.constraint === constraint;
}
