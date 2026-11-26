# 014 — Escape hatch: pointing `DATABASE_URL` at the owner turns RLS off

Date 26.11.2026 · Author @MarkoBojich with Claude · **Status: accepted** · Closes the "escape hatch" item of D4-B2

## Context
Row-level security (migration `0005_rls.sql`) is what keeps one organization's rows away from another. It is enabled with `ENABLE ROW LEVEL SECURITY`, **not** `FORCE`. In PostgreSQL the owner of a table is exempt from its policies unless the table is `FORCE`d, so `horeca_owner` (migrations, seed) sees and changes every row without any policy being asked.

That is deliberate (see below), but it means the whole tenant isolation rests on one fact: **the web and worker processes never connect as the owner.** If `DATABASE_URL` pointed at `horeca_owner` — a copy-paste mistake in a `.env`, a "just to make it work" change — the application would run with RLS silently off. Nothing would fail: every page would still render, and every query would return more than it should.

## Decision
- **Keep `ENABLE`, do not `FORCE`.** The owner stays exempt.
- **Treat "`DATABASE_URL` is the owner" as the known escape hatch** and defend it by separation, not by a switch in the database:
  - web uses `DATABASE_URL` → `horeca_app`; the worker uses `DATABASE_URL` and `DATABASE_WORKER_URL` → `horeca_app` / `horeca_worker`; `DATABASE_MIGRATE_URL` (owner) is required only by the migrate and seed entry points (`ROLE_KEYS` in `src/env.core.ts`), never by web or worker.
  - integration tests and the psql RLS tests (`pnpm test:rls`) run the application paths as `horeca_app`, so a policy that stops working is caught in CI.
- **Review rule:** a change that touches `DATABASE_URL`, the Compose files or the init script is checked against this ADR. `DATABASE_URL` is never the owner's URL, on any environment.
- **Make an empty read visible while developing** (`src/server/db/rls-debug.ts`): with `APP_ENV=local`, `warnIfEmptyRead()` logs the RLS context next to a read that returned no rows. RLS hides rows silently, so "my query returns nothing" otherwise looks the same as "the data is not there". The helper logs nothing on staging and production.

## Alternatives rejected (and why)
- **`FORCE ROW LEVEL SECURITY` on every table.** It would close the hatch, but our `SECURITY DEFINER` functions (`app.recompute_order`, `app.next_invoice_number`, `app.resolve_commission_bps`) are owned by `horeca_owner` and rely on the owner's exemption to read across organizations (an order's total needs every sub-order, whoever is acting). Migrations and the seed would also need policies written for the owner. That is a larger redesign than the MVP warrants.
- **A separate role that owns the functions** (e.g. `horeca_definer`) so the table owner could be `FORCE`d. Cleaner, but one more login, more grants and a migration of ownership, for a risk that the review rule and tests already cover.
- **Rely on `BYPASSRLS` being absent from the owner.** It does not help: a table owner is exempt from RLS without the `BYPASSRLS` attribute.
- **Log the empty read in every environment.** Empty reads are normal in production (a buyer with no orders) and the log line carries user and organization ids; it stays local.

## Consequences
- Code: new `src/server/db/rls-debug.ts` (+ unit test). Domain reads can wrap their result with `warnIfEmptyRead(log, actor, "products.list", rows)`; none exist yet (services start with D5).
- Docs: `CLAUDE.md` mentions the helper; `docs/specification/data-model.md` links this ADR from the RLS section.
- **Not done, possible later:** a startup check that refuses to boot the web or worker when the connected database user is `horeca_owner`. It would turn the review rule into a failing process. Not part of D4-B2.
