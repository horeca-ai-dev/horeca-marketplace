-- 0000 — the ltree extension only (CLAUDE.md rule 15, APPLIED.md: no pg_trgm).
-- Category paths (categories.path) use ltree. It is a "trusted" extension, so horeca_owner
-- (not a superuser, but the database owner) is allowed to create it.
CREATE EXTENSION IF NOT EXISTS ltree;
