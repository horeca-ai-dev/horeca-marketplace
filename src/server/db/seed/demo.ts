/**
 * Seeds the demo users and organizations (D3-B1; APPLIED.md "D3-B1 · seed — which login").
 *
 *   users          through Better Auth's SERVER API — never hand-made password hashes. The server API does
 *                  not check REGISTRATION_OPEN (only the HTTP endpoint does), so this works on a closed
 *                  production too.
 *   organizations  organization + member + profiles as `horeca_owner`: reference rows are not created by
 *                  a user, and the owner is not subject to the row-level policies.
 *
 * Idempotent: a user is recognised by e-mail, an organization by its slug (`demo-<key>`); anything that
 * exists is left alone, so a second run changes nothing (and never resets a changed password).
 */
import { generateId } from "@better-auth/core/utils/id";
import { eq } from "drizzle-orm";
import { getAuth } from "@/server/auth/auth";
import type { Db } from "../client";
import {
  buyerLocations,
  member,
  organization,
  orgProfiles,
  session,
  supplierProfiles,
  user,
} from "../schema";
import type { Tx } from "../tx";
import { DEMO_ORGS, demoUsers } from "./demo-data";

export type DemoSeedResult = {
  usersCreated: number;
  organizationsCreated: number;
};

/** Finds the user by e-mail or creates it. Returns the Better Auth user id either way. */
export async function ensureDemoUser(
  db: Db,
  spec: { email: string; name: string },
  password: string,
): Promise<{ id: string; created: boolean }> {
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, spec.email));
  if (existing) return { id: existing.id, created: false };

  const signUp = await getAuth().api.signUpEmail({
    body: { name: spec.name, email: spec.email, password },
  });
  const id = signUp.user.id;
  // Sign-up also opened a session nobody will ever use — remove it, so a seed leaves no live tokens.
  await db.delete(session).where(eq(session.userId, id));
  return { id, created: true };
}

/** Creates every missing demo organization with its owner membership and profiles. */
export async function seedDemoOrganizations(
  tx: Tx,
  userIdByEmail: ReadonlyMap<string, string>,
): Promise<number> {
  let created = 0;
  // Memberships get strictly increasing timestamps: the oldest one is the organization a new
  // session starts in (the multi-organization user starts as a buyer).
  const base = Date.now();

  for (const [index, spec] of DEMO_ORGS.entries()) {
    const slug = `demo-${spec.key}`;
    const [existing] = await tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, slug));
    if (existing) continue;

    const userId = userIdByEmail.get(spec.owner.email);
    if (!userId) throw new Error(`No user id for ${spec.owner.email}`);

    const organizationId = generateId();
    const at = new Date(base + index);
    await tx.insert(organization).values({
      id: organizationId,
      name: spec.legalName,
      slug,
      createdAt: at,
    });
    await tx.insert(member).values({
      id: generateId(),
      organizationId,
      userId,
      role: "owner",
      createdAt: at,
    });
    // Every column named explicitly — never spread data into an insert (CLAUDE.md rule 13).
    await tx.insert(orgProfiles).values({
      organizationId,
      type: spec.type,
      status: "approved",
      legalName: spec.legalName,
      taxId: spec.taxId,
      addressLine: spec.addressLine,
      city: spec.city,
      postalCode: spec.postalCode,
      contactEmail: spec.owner.email,
    });
    if (spec.type === "supplier") {
      await tx.insert(supplierProfiles).values({
        organizationId,
        iban: spec.iban ?? null,
        commissionOverrideBps: spec.commissionOverrideBps ?? null,
      });
    }
    if (spec.type === "buyer" && spec.location) {
      await tx.insert(buyerLocations).values({
        organizationId,
        label: spec.location.label,
        addressLine: spec.location.addressLine,
        city: spec.location.city,
        postalCode: spec.location.postalCode,
        isDefault: true,
      });
    }
    created += 1;
  }
  return created;
}

/** Users first (Better Auth), then the organizations in one owner transaction. */
export async function seedDemo(
  db: Db,
  password: string,
): Promise<DemoSeedResult> {
  const userIdByEmail = new Map<string, string>();
  let usersCreated = 0;
  for (const spec of demoUsers()) {
    const { id, created } = await ensureDemoUser(db, spec, password);
    userIdByEmail.set(spec.email, id);
    if (created) usersCreated += 1;
  }
  const organizationsCreated = await db.transaction((tx) =>
    seedDemoOrganizations(tx, userIdByEmail),
  );
  return { usersCreated, organizationsCreated };
}
