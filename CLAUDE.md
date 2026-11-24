# CLAUDE.md — working agreement for Claude in this repository

You are helping a **team of two** build the **HoReCa B2B Marketplace** in a **3-week (21-day, 7 days a week)** practical phase (AI-DEV 2026, DevelopersLab · Coinis). Both members must be able to explain every line you help write. Optimise for **correct, small, understandable, tested** — not for the biggest feature list.

## Project in one paragraph
A multi-vendor B2B web platform; everything except login/registration requires login. Suppliers (companies) list products manually or via CSV import. Buyers (HoReCa companies) search one structured catalogue and check out **once** for products from **several suppliers**. The platform splits the checkout into **per-supplier sub-orders** with independent statuses, computes the **platform commission**, records what each supplier is owed in an **append-only ledger**, and issues **one pro-forma invoice PDF per order** (the buyer pays the platform; the admin records payments, refunds and supplier payouts). A platform admin approves suppliers, manages categories and commission. **No real money flows.** Stretch features are only built after the MVP gate (see `TASKS.md`).

## Read these first
| File | Use it for |
|---|---|
| `docs/specification/` | The programme's specification (filled in on D3; it links to the decision files instead of copying them). Until it exists, `docs/decisions-9-11/` + `APPLIED.md` are the source of truth for the schema, permissions and money |
| `TASKS.md` | Timeline, gates, stretch order, today's tasks |
| `DESIGN.md` | UI tokens, components, screens, copy, accessibility |
| `README.md` | Setup, environment rules, deployment, known limitations |
| `docs/decisions-9-11/` | Decisions 9–11: `DECISIONS-9-11.md`, `permission-matrix.md`, `money-rules.md` + `money-vectors.json`, `seed-categories.md`, schema drafts (`schema/*.ts`, `schema/rls.sql`), RLS tests — **source for the schema, policies and money code** |
| `docs/decisions/` | ADRs for later decisions — why things are the way they are |

Before implementing: **name the task ID and spec section** it belongs to and read that part of the spec. If the spec is silent or wrong, **propose a spec change** instead of silently deviating.

## Stack (decided — do not substitute)
Next.js 16.4 (App Router) · TypeScript strict · Node.js 26 LTS · PostgreSQL 16 · Drizzle ORM · Better Auth (organization plugin) · Zod · next-safe-action · Tailwind + shadcn/ui · TanStack Table · React Hook Form · Meilisearch 1.56 · pg-boss (job queue inside PostgreSQL — no Redis) · **media files on a Docker volume** behind `src/server/storage` + sharp (3 WebP sizes) · Playwright (PDF rendering in the worker, and E2E tests) · React Email · SMTP to Mailpit in every environment · pino · Vitest · Testcontainers · fast-check · Docker Compose · GitHub Actions · GHCR · Nginx · Tailscale.
**Versions:** exact versions pinned (no `^`) — record the pinned pg-boss and Better Auth versions here, since behaviour was checked against them; a new dependency or upgrade must be **at least two weeks old** — except security releases of things we already use. Fallback if a library does not support Node 26: Node 24.
**Next.js 16 specifics:** check the 16.4 docs before using any Next.js API (16.x is newer than much training data) · Cache Components **off**, every page dynamic · route guards in layouts + `proxy.ts` (Next 16's name for middleware) · `serverActions.allowedOrigins` = both domains.

## Commands
```
pnpm install
docker compose -f docker-compose.dev.yml up -d   # Postgres (+ init script with the 3 logins), Meilisearch, Mailpit
pnpm db:migrate          # apply migrations
pnpm db:seed             # demo data
pnpm dev                 # web app → http://localhost:3000
pnpm worker:dev          # pg-boss worker (separate terminal)
pnpm lint && pnpm typecheck && pnpm test     # before every push
pnpm format              # Prettier (format:check in CI)
pnpm test:integration    # Testcontainers (needs Docker)
pnpm test:e2e            # Playwright
pnpm search:reindex      # rebuild Meilisearch from Postgres
```
Keep this section accurate — update it in the same PR that changes a command.

## Project layout
```
src/
  app/              # Next.js routes & UI: (public)/, buyer/, supplier/, admin/, api/
  components/       # ui/ (shadcn primitives), domain/ (ProductCard, MoneyText…)
  server/
    domain/         # services, policy, money, state machines — FRAMEWORK-FREE
    db/             # Drizzle schema, migrations, withTx(), scoped query helpers
    jobs/           # pg-boss queues and processors; enqueue(tx, …)
    search/         # Meilisearch client + searchProducts()
    email/          # sendEmail() adapter (SMTP) + React Email templates
    storage/        # save / read / delete files on the media volume (the only file-system access)
  lib/              # Zod schemas shared by UI & domain, formatting helpers
  env.ts            # the ONLY place that reads process.env
  worker.ts         # worker entry point
```

## Architecture rules (non-negotiable)
1. **Domain layer is framework-free.** `src/server/domain/**` never imports `next/*`, `react`, or anything from `src/app`. ESLint enforces this.
2. **Every domain function takes `(tx, actor, input)`.** `tx` is the Drizzle transaction handle. **Never use the global `db` inside a domain function** — a query on `db` silently runs outside the transaction. Only the entry point (Server Component, Server Action, route handler, job) opens a transaction. **Every database access goes through a transaction helper — reads included** — because that is where the RLS context is set: `withTx(actor)` for users (app database login), `withSystemTx()` for worker jobs that act for no user (worker database login via `DATABASE_WORKER_URL`, which only the worker container has). Jobs acting **for** a user (CSV import) use `withTx(actor)` with the actor captured at enqueue time. The three database logins are created by the Postgres **init script** (local, CI, server); migrations only grant.
3. **Actor comes from the session, never from the client.** `actor = { userId, orgId, orgType, role }` is resolved from the session's `activeOrganizationId` **and re-checked against the `member` table** on every request. Never accept `orgId`, `supplierId` or `buyerId` from input, URL or body.
4. **Reads and writes.** Reads: Server Components call domain query functions. Writes: Server Actions via **next-safe-action** — validate with Zod → resolve actor → `withTx()` → domain function → typed result. Actions contain no business logic.
5. **Route handlers only for:** Better Auth (`/api/auth/[...all]`), image and CSV upload, media serving (`/media/...`, login required), PDF download, `/api/health`; stretch S6: payment callback and mock gateway page. Nothing else gets an HTTP endpoint without discussion.
6. **Authorization lives in the domain layer** (`policy.can(actor, action, resource)`), never only in middleware, layouts or pages. Every Server Action is a public POST endpoint. Tenant data is read through scoped helpers. Responses: another organization's resource or area → **404** (never 403); own organization's resource but the role may not → **403**; own resource in the wrong status → **409** with a message; invalid input → **422**. Postgres RLS is the second layer (the transaction helpers set the organization context). Better Auth's own tables have no RLS. Every new action or route gets an entry in the **authorization test matrix**. Permissions: `docs/decisions-9-11/permission-matrix.md` (named policies = `policy.can` actions).
7. **Money:** integer **cents** (EUR, `bigint`), never floats. All arithmetic and rounding happens **only** in `src/server/domain/money.ts`. VAT per line; round per line; totals are sums of rounded lines; order totals are derived from sub-orders. Rates in **basis points**; rounding **half-up**, in exactly two places: VAT once per line, commission once per sub-order (on the **net**). The commission rate is **snapshotted** onto the sub-order at checkout. The supplier is owed **gross − commission**. Rules and test vectors: `docs/decisions-9-11/money-rules.md`, `money-vectors.json`. VAT rates 2100 / 1500 / 700 / 0 bps; payment term = one setting (`invoice_due_days` = 8); payment methods `proforma` (default) and `bank_transfer` differ only in label. **Checkout locks only `cart_items … FOR UPDATE`** — `FOR SHARE` on products or `org_profiles` returns 0 rows under RLS for a buyer; revalidate inside the transaction instead.
8. **Snapshots:** order lines copy product name, SKU, unit price, VAT rate at checkout; the delivery address is copied into the order. Historical orders never join live product data.
9. **Ledger is append-only.** Corrections are new (reversal) entries — never UPDATE or DELETE. Balance = `SUM(entries)`.
10. **State changes only through one `transition(entity, event, actor)` function** per state machine, fully unit-tested.
11. **Side effects run as jobs.** E-mails, search index updates, PDFs and image sizes are pg-boss jobs **enqueued inside the same transaction** (`enqueue(tx, …)`), so they exist exactly when the data commits. Job processors are idempotent (safe to run twice). **Payloads carry IDs only; every processor re-reads and re-checks state** — the pg-boss tables have no RLS and `horeca_app` can enqueue any job type, so a payload is untrusted input. pg-boss: its schema is installed and its queues created by the **migrate** container (owner); web and worker start with `migrate: false` (web also without supervision and scheduling); `enqueue(tx, …)` runs inside the Drizzle transaction. Never send e-mail, call Meilisearch or render a PDF inside a transaction or a web request.
12. **Search only through `searchProducts()`.** Postgres is the source of truth. Meilisearch holds only visible products (approved supplier, active, not deleted); results are re-fetched from Postgres by ID. **Supplier and admin dashboards never query Meilisearch.**
13. **Validation:** Zod at every boundary; shared schemas in `src/lib/schemas`. Attribute schemas are generated from attribute definitions; unknown keys are rejected. No mass assignment — never spread request input into an insert/update.
14. **Configuration:** read env **only** through `src/env.ts` (Zod-validated, `server-only`). **Never introduce `NEXT_PUBLIC_*` variables** — they are frozen at build time and we build one image for staging and production. If the browser needs a value, pass it from a Server Component.
15. **Migrations:** Drizzle. Never edit a merged migration — add a new one. Production deploys take a `pg_dump` first; rollback is manual (redeploy the previous SHA, restore the dump if a migration broke data) — so migrations do **not** need to be backward-compatible. Migration conflict after rebase: delete your generated migration, regenerate, commit. ERD changes after gate G1 need an ADR. The **first** migration only creates the extension `ltree` (`pg_trgm` is not used — search is Meilisearch); RLS policies, roles' privileges and triggers are **SQL migrations in the same chain** (never a file re-run on every deploy) — a policy change is a new migration. Every new table gets RLS policies, a matrix entry and RLS tests in the same PR.
16. **Errors:** domain code throws typed errors (`NotFound`, `Forbidden`, `Conflict`, `Validation`). Server Actions return `{ ok: false, code, message, fieldErrors? }`; route handlers return `application/problem+json`. Never swallow errors; log with pino; never send stack traces or internal IDs to the client.
17. **Dependencies:** never add one without asking, saying why, and checking it is maintained.

## Infrastructure rules
- **Traffic path:** internet → friend's public proxy (TLS, certbot) → Tailscale → our Nginx (listens on the Tailscale address only) → app on `127.0.0.1`. Our Nginx trusts `X-Forwarded-For` only from the friend's Tailscale IP (`set_real_ip_from`) and passes `X-Forwarded-Proto: https` through unchanged — never overwrite it, or auth cookies break.
- **Media volume:** product images and invoice PDFs live on a Docker volume mounted into web and worker; staging and production have separate volumes; the volume is part of the nightly backup. Media responses use `Cache-Control: private` (never cacheable by a proxy).
- **Every Docker `ports:` entry starts with `127.0.0.1:`.** `"3000:3000"` binds to all interfaces and bypasses the host firewall (ufw). Postgres and Meilisearch get **no** `ports:` entry on the server.
- **No Redis:** the job queue (pg-boss) lives in PostgreSQL; there is no application cache.
- **Health:** deploys are gated on Postgres + migration version only; Meilisearch, Mailpit and the worker are reported as degraded, not blocking. The worker counts as degraded when the oldest waiting pg-boss job is older than 5 minutes (no heartbeat store). `deploy.sh` prunes old images (keeps the last five SHAs).
- **Staging and production are fully separate** (Compose projects, networks, database and media volumes, keys). Staging never receives production data.
- Playwright/Chromium runs **only in the worker**.
- Docker log rotation is always configured (`max-size`, `max-file`).

## Security rules
- **Never** commit or paste secrets, API keys or real personal data. `.env*` is git-ignored; document variables in `.env.example`.
- **Auth is Better Auth — locked down.** Never hand-roll password hashing, sessions or tokens. Users cannot create or delete organizations through Better Auth's endpoints (`allowUserToCreateOrganization: false`, deletion off); organizations are created only by our registration. `trustedOrigins` = both domains; client-IP header configured for its rate limiter; `REGISTRATION_OPEN` can close registration. Production seed passwords come from env; the seed refuses to run without them.
- Uploads go through the app (route handler): verify file type by **magic bytes**, enforce size limits (images 5 MB). Stored file names are random and never reused. Media is served only to logged-in users.
- CSV exports escape cells starting with `=`, `+`, `-`, `@` (formula injection).
- Rate limits: Better Auth's defaults + a sign-in rule; one active CSV import per supplier. Set security headers.
- Audit log entries for: supplier approvals, commission changes, buyer payments / refunds, payouts.
- No card data anywhere. *(Stretch payments: verify callback HMAC in constant time, dedupe by event ID, check amount.)*
- **AI features (stretch):** off by default (`AI_ENABLED=false`), switched on only for testing and the demo; CI never calls the API (model mocked). Claude API server-side only; key and model from env; no personal data in prompts; request JSON and validate it with Zod; the model never writes SQL or decides authorization; rate and cost caps; always a non-AI fallback; treat user text and model output as untrusted.
- Legal/tax specifics (VAT rates, PIB format, fiscalization): say what you are unsure of and mark it **"verify"**.

## Testing rules
- **Required** for critical logic: money, order splitting, commission, state machines, CSV validation, authorization matrix, search visibility.
- Money and state machines: tests first (or together). **fast-check** property tests for invariants: order gross = Σ sub-order gross = Σ line gross · payable + commission = sub-order **gross** · 0 ≤ commission ≤ sub-order net · no negative amounts · ledger balance = Σ entries · a cancelled sub-order's entries sum to 0 · order totals never change after checkout. The worked examples in `money-vectors.json` are unit-test vectors.
- RLS tests (`docs/decisions-9-11/tests/*.sql`) run **with `psql`** in CI against the real migrations (init script → migrate entry → `psql -f`; never `run_db_tests.sh`, which uses the drafts) — **edited only as `APPLIED.md` lists** (invoice sequence, no `thumb_key`, checkout locking).
- Integration tests use **real** Postgres and Meilisearch via Testcontainers. Never mock the database.
- Keep the **transaction-rollback test**: a forced failure during checkout must leave nothing persisted.
- E2E (Playwright): a **smoke test** after every staging deploy; the **full suite** (Definition of Done scenarios) before each gate.
- A bug fix starts with a failing test.

## Git and process
- Trunk-based. Branches `type/issue-short-desc` (`feat/14-csv-import`); types: feat, fix, refactor, test, docs, chore, ci, infra.
- **Conventional Commits** (enforced by commitlint locally and in CI). Small commits. **Rebase-and-merge** (no squash) so both members' commits stay on `main`. Add `Co-authored-by:` when helping on the other's branch.
- **One PR per feature slice** (2–3 per person per day), aim < 400 changed lines (excluding generated migrations and lockfiles). No required approval: CI must be green, then the **author merges**. The other member reads merged PRs daily ("do I understand what this does and why?"); Claude Code reviews when wanted. Branches need not be up to date with `main`. No force-push to `main`.
- Fill in the PR template checklist honestly.
- Significant decision → ADR in `docs/decisions/NNN-title.md` with rejected alternatives.

## How to work with us
- **Plan before code** for anything larger than ~50 lines: files, functions, tests, risks — then wait for a go-ahead.
- **Small diffs.** One task per change. Don't refactor unrelated code.
- **Explain as you go** in plain language: what, why, trade-offs. End non-trivial changes with 2–3 "explain-back" questions.
- **State assumptions**; when blocked, ask one focused question instead of guessing.
- **Be honest:** flag bugs, risky shortcuts and missing tests in your own output. Never claim something works unless you ran it — say what you did not verify.
- Prefer boring, well-documented solutions. Match existing code style.
- Respect the **gates and stretch order in `TASKS.md`**: no stretch work while the MVP gate is red; no new features after the feature freeze.
- When reviewing: check authorization, transactions (`tx` usage), rounding, failure paths and tests first.
- **Daily explain-back:** the member who read the day's hardest PR explains it to its author (20 min); stalled questions go into `docs/explain-back.md`.

## Definition of Done (per task)
Merged through a PR with green CI (read by the other member in the daily read) · lint, typecheck and tests green · tests for critical logic · authorization matrix updated if an action/route was added · spec/README/TASKS updated if a decision changed · no secrets · both members can explain it.

## Scope guard
**Do not build** wishlists, reviews, loyalty programmes, chat, shipping integration, real payments, fiscalization, multi-currency or native apps. Stretch features only after the MVP gate, only as listed in `TASKS.md`.

## Open questions (do not invent — ask)
For the mentors (D3, `MENTOR-QUESTIONS.md`): **M1** confirm the payment model (buyer pays the platform — as the brief describes) · **M2** shipping before payment (current: allowed) · **M3** buyer suspension (current: no) · **M4** VAT on commission / pro-forma content (current: out of scope) · **M5** confirm VAT 21 / 15 / 7 / 0 % and tax IDs of 8 or 13 digits · product photos · use of the Claude API key · licence.

## Domain glossary
**HoReCa** hotels/restaurants/cafés · **organization** a company account (`buyer`, `supplier` or `platform`) · **member** user's membership in an organization (`owner` or `member`) · **actor** the user acting for their active organization · **sub-order** a supplier's part of an order · **commission** platform fee on sub-order net · **payable** what the platform owes the supplier = sub-order gross − commission · **ledger** append-only money entries per supplier (+ = platform owes more) · **pro-forma** non-fiscal invoice, one per order, issued by the platform, numbered by a normal sequence, rendered once (never regenerated) · **bps** basis points (2100 = 21 %) · **PIB** Montenegrin tax ID · **IDOR** accessing another tenant's record by ID · **`tx`** the Drizzle transaction handle.
