/**
 * Actor — who is acting (D2-B3, CLAUDE.md rule 3).
 *
 * Always built on the server from the session (+ a re-check against the `member` table), never taken
 * from the client. Every domain function receives it: `fn(tx, actor, input)`.
 *
 * Framework-free: this folder never imports next/*, react or src/app (rule 1).
 */
export const ORG_TYPES = ["buyer", "supplier", "platform"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

/** Roles inside one organization. Better Auth stores the role as text in `member.role`. */
export const MEMBER_ROLES = ["owner", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export type Actor = {
  readonly userId: string;
  readonly orgId: string;
  readonly orgType: OrgType;
  readonly role: MemberRole;
};

export function isOrgType(value: unknown): value is OrgType {
  return (
    typeof value === "string" &&
    (ORG_TYPES as readonly string[]).includes(value)
  );
}

export function isMemberRole(value: unknown): value is MemberRole {
  return (
    typeof value === "string" &&
    (MEMBER_ROLES as readonly string[]).includes(value)
  );
}
