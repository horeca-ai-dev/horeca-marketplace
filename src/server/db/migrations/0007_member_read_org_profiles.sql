-- Issue #63 — a member may read the profile of EVERY organization they belong to, not only the active one.
--
-- Why: org_profiles_read (0005) shows an organization its own row (organization_id = app.org_id()), the platform
-- everything, and approved suppliers to anyone logged in. A user who belongs to two organizations (the seed's
-- multi@demo.local is a buyer AND a supplier) therefore could not read the type or the name of the one they are
-- NOT acting for — and the organization switcher (D7-A3) has to list both. Policies are OR-ed, so this only ADDS
-- visibility, and only for the user's own memberships; nothing else changes.
--
-- `member` is Better Auth's table: it has no RLS, and horeca_app (the login Better Auth itself uses) can read it
-- (0001). The lookup is served by member_userId_idx / member_organizationId_idx. app.user_id() is NULL without
-- context, so a connection with no actor still sees nothing through this policy.
--
-- Read only: the guard trigger and the UPDATE policy of org_profiles are untouched, so being a member of
-- another organization lets nobody change its profile — acting for it still goes through the session switch,
-- which Better Auth and resolveActor check.
CREATE POLICY org_profiles_read_member ON org_profiles FOR SELECT TO horeca_app USING (
  EXISTS (SELECT 1 FROM member m
          WHERE m.organization_id = org_profiles.organization_id
            AND m.user_id = app.user_id()));
