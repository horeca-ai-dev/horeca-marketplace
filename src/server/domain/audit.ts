/**
 * Audit log entries (CLAUDE.md "Security rules": supplier creation, commission changes, legal-data and
 * bank-detail changes, payouts, …). `audit_log` is insert-only.
 *
 * Written in the SAME transaction as the change it records, so the entry exists exactly when the change
 * commits. The RLS policy `audit_log_insert` only lets an actor write entries in its own name, and the
 * actor never reads them back (the log is readable by the platform only): no `.returning()` here.
 *
 * What goes into `before` / `after` is the caller's responsibility: only the fields that changed, and never a
 * secret — a bank account number is stored masked (`maskIban`).
 */
import { auditLog } from "@/server/db/schema";
import type { Tx } from "@/server/db/tx";
import type { Actor } from "./actor";
import type { Action } from "./policy";

export type AuditEntry = {
  /** The policy name of what was done, e.g. `orgProfile.update`. */
  action: Action;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

export async function recordAudit(
  tx: Tx,
  actor: Actor,
  entry: AuditEntry,
): Promise<void> {
  await tx.insert(auditLog).values({
    actorUserId: actor.userId,
    actorOrgId: actor.orgId,
    actorOrgType: actor.orgType,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
