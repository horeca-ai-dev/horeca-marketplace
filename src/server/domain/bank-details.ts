/**
 * A supplier's bank details for payouts (D5-B4, issue #65; matrix: supplierProfile.viewBankDetails /
 * .updateBankDetails).
 *
 * Only the OWNER of the supplier sees and changes the IBAN (a member gets Forbidden, and the page says "only
 * the owner can see this"; the RLS policies on `supplier_profiles` say the same). A change is audited in the
 * same transaction with the account number MASKED (`ME25…9951`) — the log must not hold a whole account.
 *
 * Works on `actor.orgId` only. The platform sees a supplier's bank details through the admin screens (D13),
 * which will name the supplier explicitly; here it has no supplier profile and gets NotFound.
 */
import { eq } from "drizzle-orm";
import {
  maskIban,
  updateBankDetailsSchema,
  type UpdateBankDetailsInput,
} from "@/lib/schemas/company";
import { supplierProfiles } from "@/server/db/schema";
import type { Tx } from "@/server/db/tx";
import type { Actor } from "./actor";
import { recordAudit } from "./audit";
import { NotFound } from "./errors";
import { assertCan } from "./policy";
import { parseInput } from "./validation";

export type BankDetails = { iban: string | null; updatedAt: Date };

export async function getBankDetails(
  tx: Tx,
  actor: Actor,
): Promise<BankDetails> {
  assertCan(actor, "supplierProfile.viewBankDetails", { orgId: actor.orgId });
  const [row] = await tx
    .select({
      iban: supplierProfiles.iban,
      updatedAt: supplierProfiles.updatedAt,
    })
    .from(supplierProfiles)
    .where(eq(supplierProfiles.organizationId, actor.orgId));
  if (!row) throw new NotFound();
  return row;
}

/** Sets the IBAN (the schema normalizes it and checks format + check digits). Saving the same IBAN logs nothing. */
export async function updateBankDetails(
  tx: Tx,
  actor: Actor,
  rawInput: UpdateBankDetailsInput,
): Promise<BankDetails> {
  assertCan(actor, "supplierProfile.updateBankDetails", { orgId: actor.orgId });
  const input = parseInput(updateBankDetailsSchema, rawInput);

  const [current] = await tx
    .select()
    .from(supplierProfiles)
    .where(eq(supplierProfiles.organizationId, actor.orgId))
    .for("update");
  if (!current) throw new NotFound();
  if (current.iban === input.iban) {
    return { iban: current.iban, updatedAt: current.updatedAt };
  }

  const [updated] = await tx
    .update(supplierProfiles)
    .set({ iban: input.iban, updatedAt: new Date() })
    .where(eq(supplierProfiles.organizationId, actor.orgId))
    .returning({
      iban: supplierProfiles.iban,
      updatedAt: supplierProfiles.updatedAt,
    });
  if (!updated) throw new NotFound();

  await recordAudit(tx, actor, {
    action: "supplierProfile.updateBankDetails",
    entityType: "organization",
    entityId: actor.orgId,
    before: { iban: current.iban ? maskIban(current.iban) : null },
    after: { iban: maskIban(input.iban) },
  });
  return updated;
}
