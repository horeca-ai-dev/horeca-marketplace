/**
 * The active organization's company profile (D5-B4, issue #65; matrix: orgProfile.view / orgProfile.update).
 *
 * Both functions work on `actor.orgId` and nothing else: no organization id is ever taken from input
 * (rule 3). The platform edits its own organization here; changing OTHER organizations' profiles belongs to
 * the admin screens (D16) and will need an explicit, platform-only target.
 *
 * Rules checked here, because RLS cannot say them in words:
 *   - only the owner edits (a member gets Forbidden — the matrix: "Bo, So, P")
 *   - the tax ID (PIB) changes only through the platform (Forbidden otherwise; the database guard trigger
 *     `org_profiles_guard` refuses it too, but with a raw error)
 *   - a tax ID that another organization of the same type already has → Conflict TAX_ID_TAKEN
 *   - a change of any company field is written to the audit log in the same transaction, with the old and the
 *     new value of only the fields that changed
 * Type and status are not editable here — the columns are simply not in the update.
 */
import { eq } from "drizzle-orm";
import {
  updateOrgProfileSchema,
  type UpdateOrgProfileInput,
} from "@/lib/schemas/company";
import { warnIfEmptyRead } from "@/server/db/rls-debug";
import { orgProfiles } from "@/server/db/schema";
import type { Tx } from "@/server/db/tx";
import { getLogger } from "@/server/logger";
import type { Actor } from "./actor";
import { recordAudit } from "./audit";
import { Conflict, Forbidden, NotFound } from "./errors";
import { assertCan } from "./policy";
import { parseInput } from "./validation";

const log = getLogger("org-profile");

type Row = typeof orgProfiles.$inferSelect;

/** What the company page shows: no internal columns (rejection reason, who changed the status). */
export type OrgProfileRecord = Pick<
  Row,
  | "organizationId"
  | "type"
  | "status"
  | "legalName"
  | "taxId"
  | "vatNumber"
  | "addressLine"
  | "city"
  | "postalCode"
  | "country"
  | "contactEmail"
  | "contactPhone"
  | "updatedAt"
>;

/** The fields a company edits — and the ones the audit log records when they change. */
const EDITABLE = [
  "legalName",
  "taxId",
  "vatNumber",
  "addressLine",
  "city",
  "postalCode",
  "contactEmail",
  "contactPhone",
] as const;

const TAX_ID_UNIQUE = "org_profiles_tax_id_type_uq";

function toRecord(row: Row): OrgProfileRecord {
  return {
    organizationId: row.organizationId,
    type: row.type,
    status: row.status,
    legalName: row.legalName,
    taxId: row.taxId,
    vatNumber: row.vatNumber,
    addressLine: row.addressLine,
    city: row.city,
    postalCode: row.postalCode,
    country: row.country,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    updatedAt: row.updatedAt,
  };
}

export async function getOrgProfile(
  tx: Tx,
  actor: Actor,
): Promise<OrgProfileRecord> {
  assertCan(actor, "orgProfile.view");
  const [row] = warnIfEmptyRead(
    log,
    actor,
    "orgProfile.get",
    await tx
      .select()
      .from(orgProfiles)
      .where(eq(orgProfiles.organizationId, actor.orgId)),
  );
  if (!row) throw new NotFound();
  return toRecord(row);
}

/** Replaces the company fields of the active organization. Saving unchanged values changes nothing and logs nothing. */
export async function updateOrgProfile(
  tx: Tx,
  actor: Actor,
  rawInput: UpdateOrgProfileInput,
): Promise<OrgProfileRecord> {
  assertCan(actor, "orgProfile.update", { orgId: actor.orgId });
  const input = parseInput(updateOrgProfileSchema, rawInput);

  // Locked until commit: two simultaneous edits cannot both record the same "before" in the audit log.
  const [current] = await tx
    .select()
    .from(orgProfiles)
    .where(eq(orgProfiles.organizationId, actor.orgId))
    .for("update");
  if (!current) throw new NotFound();

  const next = {
    legalName: input.legalName,
    taxId: input.taxId,
    vatNumber: input.vatNumber ?? null,
    addressLine: input.addressLine,
    city: input.city,
    postalCode: input.postalCode,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone ?? null,
  };
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const field of EDITABLE) {
    if (current[field] !== next[field]) {
      before[field] = current[field];
      after[field] = next[field];
    }
  }
  if (Object.keys(after).length === 0) return toRecord(current);

  if ("taxId" in after && actor.orgType !== "platform") {
    throw new Forbidden("Only the platform can change the tax ID (PIB).");
  }

  let updated: Row | undefined;
  try {
    // Every column named explicitly — never spread input into an update (rule 13).
    [updated] = await tx
      .update(orgProfiles)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(orgProfiles.organizationId, actor.orgId))
      .returning();
  } catch (error) {
    if (isUniqueViolation(error, TAX_ID_UNIQUE)) {
      throw new Conflict(
        "A company with this tax ID (PIB) is already registered.",
        { reason: "TAX_ID_TAKEN" },
      );
    }
    throw error;
  }
  if (!updated) throw new NotFound();

  await recordAudit(tx, actor, {
    action: "orgProfile.update",
    entityType: "organization",
    entityId: actor.orgId,
    before,
    after,
  });
  return toRecord(updated);
}

/** Postgres unique_violation (23505) on the given constraint; Drizzle wraps the driver error in `cause`. */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  const cause = (
    error as { cause?: { code?: string; constraint?: string } } | null
  )?.cause;
  return cause?.code === "23505" && cause.constraint === constraint;
}
