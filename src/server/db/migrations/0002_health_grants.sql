-- 0002 — /api/health reads the applied migration version (D2-A4).
-- The Drizzle migrator keeps its bookkeeping in drizzle.__drizzle_migrations (owned by horeca_owner).
-- The web login may READ it — only hashes and timestamps, no tenant data — so the health check can
-- compare the database with the migrations bundled in the running image. No write access.
GRANT USAGE ON SCHEMA drizzle TO horeca_app;--> statement-breakpoint
GRANT SELECT ON drizzle.__drizzle_migrations TO horeca_app;
