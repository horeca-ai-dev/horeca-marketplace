# CLAUDE.md — working agreement for Claude in this repository

You are helping a **team of two** build the **HoReCa B2B Marketplace** in a **3-week (21-day, 7 days a week)** practical phase (AI-DEV 2026, DevelopersLab · Coinis). Both members must be able to explain every line you help write. Optimise for **correct, small, understandable, tested** — not for the biggest feature list.

## Project in one paragraph
A multi-vendor B2B web platform; everything except login/registration requires login. Suppliers (companies **onboarded by the platform admin**; public registration is for **buyers only**) list products manually or via CSV import; **stock comes only from each supplier's API** (mocked). Buyers (HoReCa companies) search one structured catalogue and check out **once** for products from **several suppliers**, choosing a **purchase mode per supplier group**: **direct** (under an active contract — buyer and supplier settle outside the platform) or **platform** (card payment through the mock gateway; the platform pays the supplier later); without a contract the buyer can **request one**. The platform splits the checkout into **per-supplier sub-orders** with independent statuses and modes, computes the **platform commission** on every sub-order, records what each supplier is owed (or owes) in an **append-only ledger**, and issues **one pro-forma invoice PDF for the platform part** of an order. A platform admin creates suppliers, manages categories and commission, records supplier payouts and commission payments. **No real money flows.** Decision 012 (`docs/decisions/012-purchase-modes-payments-stock.md`) is the source for modes, contracts, payments and stock. Stretch features are only built after the MVP gate (see `TASKS.md`).

## Read these first
| File | Use it for |
|---|---|
| `docs/specification/` | The programme's specification (filled in on D3; it links to the decision files instead of copying them). Until it exists, `docs/decisions-9-11/` + `APPLIED.md` are the source of truth for the schema, permissions and money |
| `TASKS.md` | Timeline, gates, stretch order, today's tasks |
| `DESIGN.md` | UI tokens, components, screens, copy, accessibility |
| `README.md` | Setup, environment rules, deployment, known limitations |
| `docs/decisions-9-11/` | Decisions 9–11: `DECISIONS-9-11.md`, `permission-matrix.md`, `money-rules.md` + `money-vectors.json`, `seed-categories.md`, schema drafts (`schema/*.ts`, `schema/rls.sql`), RLS tests — **source for the schema, policies and money code** |
| `docs/decisions/` | ADRs for later decisions — why things are the way they are. **012** (purchase modes, contracts, card payments, stock, onboarding, language) wins over older text everywhere; its schema / policy consequences are listed per task in `APPLIED.md` §4. **013** (S3-compatible storage via self-hosted Garage) replaces decision J (media on a Docker volume) |

Before implementing: **name the task ID and spec section** it belongs to and read that part of the spec. If the spec is silent or wrong, **propose a spec change** instead of silently deviating.

## Stack (decided — do not substitute)
Next.js 16.4 (App Router) · TypeScript strict · Node.js 26 LTS · PostgreSQL 16 · Drizzle ORM · Better Auth (organization plugin) · Zod · next-safe-action · next-intl (decision 012) · Tailwind + shadcn/ui · TanStack Table · React Hook Form · Meilisearch 1.56 · pg-boss (job queue inside PostgreSQL — no Redis) · **media in S3-compatible object storage — self-hosted Garage 2.5** (`dxflrs/garage:v2.5.0`, decision 013), reached only through the S3 API in `src/server/storage` + sharp (3 WebP sizes) · Playwright (PDF rendering in the worker, and E2E tests) · React Email · SMTP to Mailpit in every environment · pino · Vitest · Testcontainers · fast-check · Docker Compose · GitHub Actions · GHCR · Nginx · Tailscale.
**Versions:** exact versions pinned (no `^`) — record the pinned pg-boss and Better Auth versions here, since behaviour was checked against them (**Better Auth 1.7.20**, **pg-boss 12.38.2** — needs `@opentelemetry/api` as a peer; worker runs with `reindex: false`, see `src/server/jobs/boss.ts`); a new dependency or upgrade must be **at least two weeks old** — except security releases of things we already use. Fallback if a library does not support Node 26: Node 24.
**Next.js 16 specifics:** check the 16.4 docs before using any Next.js API (16.x is newer than much training data) · Cache Components **off**, every page dynamic · route guards in layouts + `proxy.ts` (Next 16's name for middleware) · `serverActions.allowedOrigins` = both domains.

## Commands
```
pnpm install
docker compose -f docker-compose.dev.yml up -d   # Postgres (+ init script with the 3 logins), Meilisearch, Mailpit, Garage
scripts/garage-setup.sh  # once per Garage volume: layout, bucket horeca-media, app key (printed once → .env); safe to repeat
pnpm db:migrate          # apply migrations
pnpm db:generate         # new migration from the Drizzle schema (add the new tables' grants by hand)
pnpm auth:generate       # regenerate the Better Auth tables after changing its config
pnpm db:seed             # category tree + demo organizations and users (safe to repeat); production needs a real SEED_DEMO_PASSWORD
pnpm dev                 # web app → http://localhost:3000
pnpm worker:dev          # pg-boss worker (separate terminal)
pnpm mock:dev            # mock-services: supplier stock API → http://127.0.0.1:4010 (separate terminal; no database)
pnpm build:entries       # bundle worker + migrate + seed + mock-services into dist/ (the Docker image runs these)
docker build -t horeca:local .   # the one image: web (default), worker, migrate, mock-services — see README → CI/CD
pnpm lint && pnpm typecheck && pnpm test     # before every push
pnpm format              # Prettier (format:check in CI)
pnpm test:integration    # Testcontainers: needs Docker running; starts its own Postgres (your dev database is not touched); Mailpit from Compose
pnpm test:rls            # RLS policies: real migrations on a throwaway database + docs/decisions-9-11/tests/rls_tests.sql via psql (needs the Compose postgres and .env)
pnpm test:e2e            # Playwright
pnpm search:reindex      # rebuild Meilisearch from Postgres
SMOKE_BASE_URL=… SMOKE_BASIC_AUTH_USER=… SMOKE_BASIC_AUTH_PASS=… scripts/smoke-g0.sh   # G0 smoke test (CI runs it after each staging deploy)
SMOKE_BASE_URL=https://horeca.bogdandelic.online scripts/smoke-production.sh   # read-only production smoke (CI, after each production deploy)
scripts/next-version.sh <sha>   # next release tag from the Conventional Commits (CI release job)
deploy/restore-test.sh <dump>   # restore a pg_dump into a throwaway Postgres and check it (server: /opt/horeca/bin, as deploy)
```
Keep this section accurate — update it in the same PR that changes a command.

## Project layout
```
src/
  app/              # Next.js routes & UI: (public)/, buyer/, supplier/, admin/, api/
  components/       # ui/ (shadcn primitives on our tokens + Icon), domain/ (shell/, ProductCard, MoneyText…)
  i18n/             # next-intl: config.ts (locale sr-Latn-ME, time zone), request.ts, typed message keys
  server/
    domain/         # services, policy, money, state machines — FRAMEWORK-FREE
    db/             # Drizzle schema, migrations, withTx(), scoped query helpers
    jobs/           # pg-boss queues and processors; enqueue(tx, …)
    search/         # Meilisearch client + searchProducts()
    email/          # sendEmail() adapter (SMTP) + React Email templates
    storage/        # put / get / delete / head / list via the S3 API (the only place that touches media)
  lib/              # Zod schemas shared by UI & domain, format.ts (money / date / time for display), auth-client.ts
  env.core.ts       # the ONLY place that reads process.env (Zod, assertEnv); plain-Node code imports this
  env.ts            # server-only re-export of env.core — Next.js code (src/app, src/components) imports this
  worker.ts         # worker entry point
  mock-services.ts  # mock-services entry point; its code in src/mock-services/ (external system: never imports db / domain)
messages/           # next-intl catalogues: sr-Latn-ME.json (complete), en.json (prepared, empty)
```

## Architecture rules (non-negotiable)
1. **Domain layer is framework-free.** `src/server/domain/**` never imports `next/*`, `react`, or anything from `src/app`. ESLint enforces this.
2. **Every domain function takes `(tx, actor, input)`.** `tx` is the Drizzle transaction handle. **Never use the global `db` inside a domain function** — a query on `db` silently runs outside the transaction. Only the entry point (Server Component, Server Action, route handler, job) opens a transaction. **Every database access goes through a transaction helper — reads included** — because that is where the RLS context is set: `withTx(actor)` for users (app database login), `withSystemTx()` for worker jobs that act for no user (worker database login via `DATABASE_WORKER_URL`, which only the worker container has). Jobs acting **for** a user (CSV import) use `withTx(actor)` with the actor captured at enqueue time. The three database logins are created by the Postgres **init script** (local, CI, server); migrations only grant.
3. **Actor comes from the session, never from the client.** `actor = { userId, orgId, orgType, role }` is resolved from the session's `activeOrganizationId` **and re-checked against the `member` table** on every request. Never accept `orgId`, `supplierId` or `buyerId` from input, URL or body.
4. **Reads and writes.** Reads: Server Components call domain query functions. Writes: Server Actions via **next-safe-action** — validate with Zod → resolve actor → `withTx()` → domain function → typed result. Actions contain no business logic.
5. **Route handlers only for:** Better Auth (`/api/auth/[...all]`), image and CSV upload, media serving (`/media/...`, login required), PDF download, `/api/health`, and the **payment callback** — which only **verifies** the HMAC signature (raw body, constant time, timestamp tolerance) and **enqueues one job**, then answers 200 (non-2xx if our `payments` row does not exist yet, so the gateway retries); all processing happens in the worker. The mock gateway (`/gateway/…`: hosted card page, `POST /payments`, `GET /payments/{id}`, refunds, its admin page behind basic auth) and the supplier stock API (`/suppliers/{id}/stock`, `/suppliers/{id}/orders`) live in the separate **`mock-services`** app, not in our Next.js routes. Nothing else gets an HTTP endpoint without discussion.
6. **Authorization lives in the domain layer** (`policy.can(actor, action, resource)`), never only in middleware, layouts or pages. Every Server Action is a public POST endpoint. Tenant data is read through scoped helpers. Responses: another organization's resource or area → **404** (never 403); own organization's resource but the role may not → **403**; own resource in the wrong status → **409** with a message; invalid input → **422**. Postgres RLS is the second layer (the transaction helpers set the organization context). **`DATABASE_URL` is never the owner's URL** — the owner bypasses RLS (ADR 014); a domain read that returns no rows is wrapped with `warnIfEmptyRead()` (`src/server/db/rls-debug.ts`), which logs the RLS context in `APP_ENV=local`. Better Auth's own tables have no RLS. Every new action or route gets an entry in the **authorization test matrix**: a row in `docs/decisions-9-11/permission-matrix.md` §2 **and** a row in `PERMISSIONS` (`src/server/domain/policy.ts`) — `policy-matrix.test.ts` reads the document and fails if the two differ. `decide()` answers `allow` / `not_found` / `forbidden`; service-level tests use `src/server/domain/testing/authz-harness.ts` (`ACTORS`, `outcomeOf`). Permissions: `docs/decisions-9-11/permission-matrix.md` (named policies = `policy.can` actions).
7. **Money:** integer **cents** (EUR, `bigint`), never floats. All arithmetic and rounding happens **only** in `src/server/domain/money.ts`. VAT per line; round per line; totals are sums of rounded lines; order totals are derived from sub-orders. Rates in **basis points**; rounding **half-up**, in exactly two places: VAT once per line, commission once per sub-order (on the **net**). The commission rate is **snapshotted** onto the sub-order at checkout. In platform mode the supplier is owed **gross − commission**. Rules and test vectors: `docs/decisions-9-11/money-rules.md`, `money-vectors.json`. VAT rates 2100 / 1500 / 700 / 0 bps; payment term = one setting (`invoice_due_days` = 8). **Purchase mode per sub-order** (`direct` | `platform`, decision 012 §4): commission is charged on **both**; platform: ledger `sale` +gross and `commission` −commission, the supplier is owed gross − commission; direct: only `commission` −commission (the supplier owes it; `commission_payment` +amount when paid). There is no `payment_method` column. **Checkout locks only `cart_items … FOR UPDATE`** — `FOR SHARE` on products or `org_profiles` returns 0 rows under RLS for a buyer; revalidate inside the transaction instead.
8. **Snapshots:** order lines copy product name, SKU, unit price, VAT rate at checkout; the delivery address is copied into the order. Historical orders never join live product data.
9. **Ledger is append-only.** Corrections are new (reversal) entries — never UPDATE or DELETE. Balance = `SUM(entries)`.
10. **State changes only through one `transition(entity, event, actor)` function** per state machine, fully unit-tested. The one exception: the worker cancels a sub-order (payment expiry, supplier-API rejection) through the SQL function **`app.system_cancel_sub_order(id, reason)`** (executable by `horeca_worker` only), which applies the same cancellation rules.
11. **Side effects run as jobs.** E-mails, search index updates, PDFs and image sizes are pg-boss jobs **enqueued inside the same transaction** (`enqueue(tx, …)`), so they exist exactly when the data commits. Job processors are idempotent (safe to run twice). **Payloads carry IDs only; every processor re-reads and re-checks state** — the pg-boss tables have no RLS and `horeca_app` can enqueue any job type, so a payload is untrusted input. pg-boss: its schema is installed and its queues created by the **migrate** container (owner); web and worker start with `migrate: false` (web also without supervision and scheduling); `enqueue(tx, …)` runs inside the Drizzle transaction. **No external call inside a transaction** (e-mail, Meilisearch, PDF, storage (S3), gateway, supplier API). In a **web request** only two external calls are allowed, each with a **2–3 s timeout**: the per-supplier **stock check** before the checkout transaction, and **`PaymentProvider.createPayment`** after it commits. Everything else (e-mail, search sync, PDF, submission to the supplier API, payment events) runs as a job.
12. **Search only through `searchProducts()`.** Postgres is the source of truth. Meilisearch holds only visible products (approved supplier, active, not deleted); results are re-fetched from Postgres by ID. **Supplier and admin dashboards never query Meilisearch.**
13. **Validation:** Zod at every boundary; shared schemas in `src/lib/schemas`. Attribute schemas are generated from attribute definitions; unknown keys are rejected. No mass assignment — never spread request input into an insert/update.
14. **Configuration:** read env **only** through `src/env.ts` (Next.js code; `server-only`) or `src/env.core.ts` (code that the worker, migrate, drizzle-kit or Vitest also load) — both Zod-validated; each entry point calls `assertEnv(role)` at startup. **Never introduce `NEXT_PUBLIC_*` variables** — they are frozen at build time and we build one image for staging and production. If the browser needs a value, pass it from a Server Component.
15. **Migrations:** Drizzle. Never edit a merged migration — add a new one. Production deploys take a `pg_dump` first; rollback is manual (redeploy the previous SHA, restore the dump if a migration broke data) — so migrations do **not** need to be backward-compatible. Migration conflict after rebase: delete your generated migration, regenerate, commit. ERD changes after gate G1 need an ADR. The **first** migration only creates the extension `ltree` (`pg_trgm` is not used — search is Meilisearch); RLS policies, roles' privileges and triggers are **SQL migrations in the same chain** (never a file re-run on every deploy) — a policy change is a new migration. Every new table gets RLS policies, a matrix entry and RLS tests in the same PR.
16. **Errors:** domain code throws typed errors (`NotFound`, `Forbidden`, `Conflict`, `Validation`). Server Actions return `{ ok: false, code, message, fieldErrors? }`; route handlers return `application/problem+json`. Never swallow errors; log with pino; never send stack traces or internal IDs to the client.
17. **Dependencies:** never add one without asking, saying why, and checking it is maintained. *`next-intl` (decision 012) is pinned at **4.15.1**; the install scripts of its transitive `@swc/core` and `@parcel/watcher` stay disabled (`pnpm-workspace.yaml`). shadcn/ui components are added by copying the source into `src/components/ui` and rewriting it onto our token names — never `shadcn init`, which writes its own theme into `globals.css`.*

## Infrastructure rules
- **Traffic path:** internet → friend's public proxy (TLS, certbot) → Tailscale → our Nginx (listens on the Tailscale address only, port `8081`; both environments split by `server_name`) → app on `127.0.0.1` (staging `3101`, production `3102` — `WEB_PORT`). Our Nginx trusts `X-Forwarded-For` only from the friend's Tailscale IP (`set_real_ip_from`) and passes `X-Forwarded-Proto: https` through unchanged — never overwrite it, or auth cookies break.
- **Media storage (decision 013):** product images and invoice PDFs live in **Garage** (S3-compatible), one single-node container per environment (local, staging, production), one bucket `horeca-media` and one app key (read/write on that bucket only) per environment, shared by web and worker. The app uses **only the S3 API** — no code reads or writes media on the file system. **Garage is internal:** no `ports:` entry on the server (locally only `127.0.0.1:3900`), nothing for the public proxy, Tailscale or Nginx; uploads and downloads go through our route handlers. Garage's `rpc_secret` / `admin_token` come from the environment's `.env`, never from git; Garage commands are checked against the pinned 2.x docs / `--help`. Backups are an object-level copy through the S3 API. Media responses use `Cache-Control: private` (never cacheable by a proxy).
- **Every Docker `ports:` entry starts with `127.0.0.1:`.** `"3000:3000"` binds to all interfaces and bypasses the host firewall (ufw). Postgres and Meilisearch get **no** `ports:` entry on the server.
- **No Redis:** the job queue (pg-boss) lives in PostgreSQL; there is no application cache.
- **Health:** deploys are gated on Postgres + migration version only; Meilisearch, Mailpit, Garage (storage) and the worker are reported as degraded, not blocking. The worker counts as degraded when the oldest waiting pg-boss job is older than 5 minutes (no heartbeat store). `deploy.sh` prunes old images (keeps the last five SHAs).
- **Staging and production are fully separate** (Compose projects, networks, database volumes, Garage instances with their buckets and keys, other keys). Staging never receives production data.
- Playwright/Chromium runs **only in the worker**.
- Docker log rotation is always configured (`max-size`, `max-file`).
- **`mock-services`** (mock card gateway + supplier stock API) is the **fourth entry point** of the same image (web, worker, migrate, mock-services), its own container per environment, state in memory seeded on start. Our Nginx routes `/gateway/` to it; its admin page is behind basic auth in every environment.

## Security rules
- **Never** commit or paste secrets, API keys or real personal data. `.env*` is git-ignored; document variables in `.env.example`.
- **Auth is Better Auth — locked down.** Never hand-roll password hashing, sessions or tokens. Users cannot create or delete organizations through Better Auth's endpoints (`allowUserToCreateOrganization: false`, deletion off); organizations are created only by our **buyer registration** and by the **admin's "Create supplier"** (Better Auth server API without starting a session; set-password link shown once to the admin). `trustedOrigins` = both domains; client-IP header configured for its rate limiter; `REGISTRATION_OPEN` can close registration. Production seed passwords come from env; the seed refuses to run without them.
- Uploads go through the app (route handler): verify file type by **magic bytes**, enforce size limits (images 5 MB). Stored file names are random and never reused. Media is served only to logged-in users.
- CSV exports escape cells starting with `=`, `+`, `-`, `@` (formula injection).
- Rate limits: Better Auth's defaults + a sign-in rule; one active CSV import per supplier. Set security headers.
- Audit log entries for: supplier creation, commission changes, payment receipts / refunds (written by the worker), payouts / adjustments, commission payments.
- **No card data in our app, database or logs** — card numbers are entered only on the mock gateway's hosted page (fixed banner "TEST — do not enter a real card"; only documented test numbers accepted; numbers never logged or stored). Payment callbacks: verify the HMAC in constant time, dedupe by event ID, check amount and currency.
- **AI features (stretch):** off by default (`AI_ENABLED=false`), switched on only for testing and the demo; CI never calls the API (model mocked). Claude API server-side only; key and model from env; no personal data in prompts; request JSON and validate it with Zod; the model never writes SQL or decides authorization; rate and cost caps; always a non-AI fallback; treat user text and model output as untrusted.
- Legal/tax specifics (VAT rates, PIB format, fiscalization): say what you are unsure of and mark it **"verify"**.

## Testing rules
- **Required** for critical logic: money, order splitting, commission, state machines, CSV validation, authorization matrix, search visibility, payment-event processing (duplicate / forged / out-of-order), contracts.
- Money and state machines: tests first (or together). **fast-check** property tests for invariants: order gross = Σ sub-order gross = Σ line gross · platform: payable + commission = sub-order **gross** · direct: sub-order entries sum to −commission · 0 ≤ commission ≤ sub-order net · no negative amounts · ledger balance = Σ entries · a cancelled sub-order's entries sum to 0 · order totals never change after checkout. The worked examples in `money-vectors.json` are unit-test vectors.
- RLS tests (`docs/decisions-9-11/tests/*.sql`) run **with `psql`** in CI against the real migrations (init script → migrate entry → `psql -f`; never `run_db_tests.sh`, which uses the drafts) — **edited only as `APPLIED.md` lists** (invoice sequence, no `thumb_key`, checkout locking; §4 decision 012 edits).
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

## Language
- **Montenegrin (Latin)** for everything users see: UI, e-mails, invoice PDF, validation and domain error messages, CSV import reports — through `next-intl` message catalogues from the start (no hard-coded UI strings).
- **English** for code, identifiers, comments, logs, commit messages, README, specification, ADRs and these instructions. An English UI only if time allows.

## Scope guard
**Do not build** wishlists, reviews, loyalty programmes, chat, shipping integration, real payments (the card gateway is a mock), fiscalization, multi-currency or native apps. Stretch features only after the MVP gate, only as listed in `TASKS.md`.

## Open questions (do not invent — ask)
M1–M5 were answered on 25.11 (decision 012 §1). Still to confirm with the mentors — **defaults apply unless they object** (decision 012 §14):
1. The brief's pro-forma is shown with a card-paid order; bank transfer is replaced by direct mode; Definition of Done otherwise unchanged.
2. We plan 1–2 stretch goals (S3 first) — which matters most?
3. Have the scraped suppliers agreed to appear publicly? Default: fictional names, closed registration on production.
4. Direct-mode commission is netted against platform payouts.
5. Direct-mode commission is charged at order placement, reversed on cancellation.
6. Refunds only by cancelling a paid sub-order before shipping.
7. The admin hands the set-password link to a new supplier (e-mail stays in Mailpit).
8. Presentation language?

## Domain glossary
**HoReCa** hotels/restaurants/cafés · **organization** a company account (`buyer`, `supplier` or `platform`) · **member** user's membership in an organization (`owner` or `member`) · **actor** the user acting for their active organization · **sub-order** a supplier's part of an order, with its own **mode** · **mode** `direct` (buyer and supplier invoice and pay each other under an active contract; the supplier owes the commission) or `platform` (buyer pays the platform by card; the platform pays the supplier later) — chosen per supplier group in the cart · **contract** (`supplier_agreements`) a buyer–supplier agreement: `requested` → `active` | `rejected`, `active` → `ended`; an active one enables direct mode (not the same as S5 RFQ) · **commission** platform fee on sub-order net, in both modes · **payable** what the platform owes the supplier for a platform sub-order = gross − commission · **commission payment** a direct-mode supplier paying its commission (ledger +amount) · **supplier submission** sending a sub-order to the supplier's API (`pending` / `accepted` / `rejected` / `failed`) · **mock-services** our mock card gateway + supplier stock API · **ledger** append-only money entries per supplier (+ = platform owes more) · **pro-forma** non-fiscal invoice for the **platform part** of an order (platform sub-orders only), issued by the platform, **created once at checkout**, numbered by a normal sequence, rendered once (never regenerated); orders without a platform part get none · **bps** basis points (2100 = 21 %) · **PIB** Montenegrin tax ID · **IDOR** accessing another tenant's record by ID · **`tx`** the Drizzle transaction handle.
