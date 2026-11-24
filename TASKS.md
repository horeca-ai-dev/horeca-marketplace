# TASKS.md — HoReCa B2B Marketplace

**21 days, 7 days a week:** Mon 23.11.2026 (D1) → Sun 13.12.2026 (D21). Final demo date: set by mentors.

| Owner | Focus |
|---|---|
| **A** = @BogdanD3 | Infrastructure, CI/CD, database operations, frontend |
| **B** = @MarkoBojovich | Domain layer, database schema & migrations, background jobs, seed data, E2E test suites |

Task format: `- [ ] **D9-B1** (B · 4h)` = day 9, task 1, owner B, estimate. Estimates include reviewing Claude's output; plan ≈ 6 focused hours per person per day **plus ≈ 1h of reading the other member's merged PRs** (not in the estimates).

## Workflow
**Code flow** (details in README → Git workflow, CI/CD):
1. Pick the next task → GitHub Issue → branch `type/issue-short-desc`. Related tasks of one feature may share one branch.
2. Small Conventional Commits; Husky hooks run lint, format, commitlint, typecheck.
3. **One PR per feature slice** (aim 2–3 per person per day) → CI green → the **author** rebase-and-merges (0 required approvals). Branches do not have to be up to date with `main` before merging (CI runs on the merge result).
4. Merge deploys to **staging** automatically; an E2E **smoke test** runs there. The **full E2E suite** runs before each gate.
5. **End of day:** check staging; if good, approve the pending production deploy (ships everything merged that day) → release tag is created automatically.

**Rules that keep two people unblocked and both able to explain everything:**
- **Contract first:** before a feature, B writes the domain function signatures and their Zod input/output schemas (`src/lib/schemas`); A builds the UI against stubs while B implements.
- B owns `src/server/db` schema and migrations, so migrations never conflict.
- If CI fails on your PR → fix on the same branch. If staging is broken after a merge → new branch, new PR.
- **Reviews are light and after the merge:** each day, read the other member's merged PRs ("do I understand what this does and why?"); ask Claude Code for a review when wanted.
- **Daily explain-back (20 min, end of day):** the member who read the day's hardest PR explains it to its author. Questions that stall go into `docs/explain-back.md` — your rehearsal for the mentors.
- **By 16:00 on a heavy day,** decide what moves to the next morning — no working past midnight.
- **Weekly Progress Report** (required by the programme, graded under Process): each member fills it in before every mentor check-in (≈ 20 min).

## Gates
| Gate | When | Must be true |
|---|---|---|
| **G0 Skeleton** | Wed 25.11 (D3) EOD | One PR through CI and merged; the pipeline deployed it to **staging**; health green; checked **through both proxies** with a small script: register + login via `curl` against the auth API, one throwaway page with a single Server Action, failed logins from two networks counted separately. Until D10 this script is the E2E smoke test |
| **G1 Spec submitted & schema migrated** | Thu 26.11 (D4) EOD | The programme's Software Specification **submitted** to the mentor · the schema from `docs/decisions-9-11` implemented as migrations · RLS on and `rls_tests.sql` green in CI · both members can explain `rls.sql` |
| **G2 Happy path** | Wed 02.12 (D10) EOD | On staging: supplier products → search → cart → checkout → sub-orders → each supplier sees only its own |
| **G3 MVP** | Sun 06.12 (D14) EOD | Definition of Done passes **on staging by Sat 05.12 evening** and **on production on Sun 06.12**: products from ≥ 3 suppliers found with filters, one order, each supplier sees only its sub-order, admin sees commission per supplier, cross-supplier access fails · pro-forma PDF · CI green |
| **G4 Feature freeze** | Fri 11.12 (D19) EOD | No new features; D20–D21 polish, docs, rehearsal, `v1.0.0` |

## Stretch
Stretch work starts only after G3. Each item plugs into a **seam built during the MVP**, so it adds code instead of rewriting it.

**Planned — the brief's stretch goals, in this order:**
| # | Stretch | Seam built in the MVP |
|---|---|---|
| S1 | Volume pricing tiers + buyer-specific prices | `PricingResolver` in cart & checkout (D8) |
| S3 | AI attribute normalisation | Attribute → Zod schema generation (D5), CSV import (D6) |
| S4 | AI natural-language search | `searchProducts(filters)` with a Zod filter schema (D7) + S3's AI client |
| S5 | Request for quote (RFQ) | `createOrder(source, lines)` (D9) |
| S6 | Mock card payment (`PaymentProvider`) | `payment_method` + payment status separate from sub-order status (D9) |

**Only if time** (not in the brief's stretch list): **S2** product compare · **S7** member invitations — tasks at the end of this file.
Whatever is not finished at G4 goes into README → Known limitations. If something slips, S6 moves first.

## After the project (not scheduled — do not open before the project is finished)
| Item | ≈ Time |
|---|---|
| Sentry error tracking (SDK + project) | 1.5h |
| External uptime monitor | 0.5h |
| Admin Jobs page (queue counts, failed jobs, retry) | 1h |
| Audit-log viewer screen (the audit table itself is written from day one) | 1h |
| i18n (next-intl) so Montenegrin can be added | 0.5h + overhead per screen |
| Attribute-definition editor in the admin UI (definitions come from the seed) | 2h |
| Supplier suspend / reinstate / re-apply screens (the rules exist in the database) | 1h |

---

## Week 1 — skeleton, spec, catalogue

### D1 · Mon 23.11 — Plan ✅
- [x] Decisions 1–8; planning documents and diagrams
- [ ] **D1-A1** (A) DNS at Namecheap: A records `horeca` and `staging.horeca` (`bogdandelic.online`) → the friend's public server IP; send `FRIEND-PROXY-TASKS.md` to the friend (certbot TLS, forward over Tailscale, forwarded headers, ≈ 20 MB uploads, longer timeouts).

### D2 · Tue 24.11 — Decisions, review, skeleton part 1
- [x] **D2-B0** Decisions 9–11 + schema drafts → `docs/decisions-9-11/`.
- [x] **D2-AB0** Decisions A–J, independent review (Fable), review decisions applied.
- [ ] **D2-AB1 First hour — easy to forget** (from the final check):
  - DNS + friend's proxy first (D1-A1) — propagation and certbot take hours.
  - Tailscale: create the **federated identity** credential (workload identity federation; subject `repo:horeca-ai-dev/horeca-marketplace:environment:*`, tag `tag:ci`) and add the grant `tag:ci` → only `tcp:22` on the server now; store `TS_OAUTH_CLIENT_ID` and `TS_AUDIENCE` in both GitHub Environments (not sensitive).
  - Both: `git config user.email` = the address on your GitHub account **before the first commit** (commits from both members are graded).
  - Push the first commit to `main`, **then** switch on the ruleset (a protected empty repo cannot take its first PR).
  - First commit contains `.gitignore` with `.env*` and the gitleaks config — before any real value exists on disk.
  - Keep the friend's server out of the public repo: no public IP, no Tailscale addresses, no `FRIEND-PROXY-TASKS.md`; Nginx examples in `deploy/` use placeholders.
  - Put both members' GitHub handles in README.md and TASKS.md (done in the first commit).
  - After the first image push: check the GHCR package is **public**, or the server's first pull fails.
  - `next.config`: Cache Components off, `serverActions.allowedOrigins` with both domains — before the first page exists.
  - Pin pg-boss and Better Auth to exact versions and note them in CLAUDE.md.
- [x] **D2-A1** (A · 1h) Free GitHub organization `horeca-ai-dev` (both owners) + **public** repo `horeca-marketplace`; `main` ruleset (PR + 0 required approvals + checks + linear history; "up to date" **not** required); Environments `staging` / `production` (production: both required reviewers); PR template; Issues + Project board; commit the planning documents, `.env.example`, `.nvmrc`, pinned pnpm, `.editorconfig`, Dependabot (security only), gitleaks config. *(PR template `.github/pull_request_template.md` was missing; added with D2-A3.)*
- [x] **D2-A2** (A · 1.5h) Next.js 16.4 + TS strict; ESLint (domain import boundary, `process.env` ban outside `src/env.ts`, `NEXT_PUBLIC_` ban); Prettier + Tailwind plugin; Husky + lint-staged + commitlint + `pre-push` typecheck.
- [x] **D2-A3** (A · 1h) `docker-compose.dev.yml`: Postgres 16 with an **init shell script** (it must read the passwords from env) that creates the three logins (`horeca_owner` = non-superuser, `horeca_app`, `horeca_worker`) and the database **owned by `horeca_owner`**; Meilisearch 1.56; Mailpit — all ports on `127.0.0.1`; exact image versions pinned. The init script runs **only on an empty data directory**, as the image's superuser (`POSTGRES_PASSWORD`), so `deploy.sh staging --reset` must remove the volume. The same script is used by Testcontainers and on the server.
- [ ] **D2-A4** (A · 3h) Dockerfile: Node 26; Next.js `standalone` for web; **worker and migrate entries bundled separately (tsup/esbuild) with their own `node_modules`** (pg-boss, sharp, Playwright, Drizzle migrator, migrations folder); Chromium via `playwright install --with-deps chromium` + fonts with č ć š ž đ; build-time switch that skips env validation; media volume mount point; `src/env.ts`; `/api/health`.
- [x] **D2-B1** (B · 1h) Drizzle config, db clients (app + worker logins), `withTx()` / `withSystemTx()`, runtime migrator, `pnpm db:*` scripts; **migration 0000 = the `ltree` extension only**. The app connects as `horeca_app` from the first commit.
- [ ] **D2-B2** (B · 3h) Better Auth (email + password, organization plugin) — **locked down:** `allowUserToCreateOrganization: false`, organization deletion off, organizations created server-side by our registration (organization + member + `org_profiles` in our transaction; the user row comes from Better Auth first — a user left without an organization goes to "Complete company setup"); review every plugin endpoint (update / invite / remove) and disable what bypasses the domain layer; `trustedOrigins` = both domains; client-IP header for its rate limiter; `REGISTRATION_OPEN` switch. Migration: Better Auth tables from its CLI (replacing the placeholder) + `org_profiles`, `supplier_profiles`, `buyer_locations` from `schema/identity-ext.ts` **+ the grants for these tables** (what `rls.sql` §3 gives `horeca_app` and `horeca_worker`) — without them `horeca_app` gets "permission denied" and register/login fail at G0. Policies and `ENABLE ROW LEVEL SECURITY` stay on D4. Registration as in `APPLIED.md` (organization + member rows inserted directly in our transaction).
- [ ] **D2-B3** (B · 1.5h) Domain scaffold: `Actor`, `resolveActor()` (session + membership re-check), `policy.can()` stub, typed domain errors, next-safe-action client with actor middleware, `serverActions.allowedOrigins` = both domains; one **throwaway page with a single Server Action** for the G0 check; `money.ts` stub + first fast-check test.
- [ ] **D2-B4** (B · 2h) **Jobs baseline:** pg-boss schema installed and queues created by the **migrate** entry (owner); web and worker start with `migrate: false` (web also without supervision and scheduling); grants on the pg-boss schema for `horeca_app` (send) and `horeca_worker` (fetch / complete) — check the exact grants against the pinned version (**time-box 45 min** — if unclear, grant the worker everything on the pg-boss schema and narrow later); `enqueue(tx, …)` inside the Drizzle transaction + **one test that a rolled-back transaction leaves no job**; `worker.ts`; `sendEmail()` over SMTP (Mailpit). *(React Email layout + password-reset e-mail moved to D6-B3.)*
- *A ≈ 6.5h, B ≈ 7.5h. Continues on D3 — G0 is Wednesday end of day.*

### D3 · Wed 25.11 — Skeleton part 2 (G0 EOD) · specification · mentor meeting
- [ ] **D3-B0** (B · 1.5h) **CI workflow:** lint, format, typecheck, commitlint, gitleaks, audit, unit, integration with Testcontainers, RLS SQL tests via `psql` (from D4), migration check (`drizzle-kit check` + the **migrate entry** on an empty database, so the pg-boss schema exists too), build.
- [ ] **D3-A1** (A · 1.5h) **CD staging half:** GHCR (image package public) → Tailscale GitHub Action `tailscale/github-action@v4` with federated identity (`permissions: id-token: write`; `oauth-client-id` / `audience` from `TS_OAUTH_CLIENT_ID` / `TS_AUDIENCE`; `tags: tag:ci`; deploy jobs run in the `staging` / `production` Environments so the subject matches; grant: `tcp:22` to the server only) → `deploy.sh staging <sha>` → migrate → health → **G0 smoke script** (written here; uses the staging basic-auth credentials from a GitHub secret).
- [ ] **D3-A2** (A · 3h) Server: `deploy` user + `deploy.sh` (ends with an image prune keeping the last five SHAs); `horeca-staging` Compose project (`mem_limit`, log rotation, media volume, Mailpit); `.env.staging` incl. the three database passwords; our Nginx on the Tailscale address (→ `127.0.0.1:3001`, basic auth, `set_real_ip_from` = friend's Tailscale IP + `real_ip_header X-Forwarded-For` (the friend's proxy overwrites it with the real visitor IP), `X-Forwarded-Proto` passed through, Mailpit UI at `/_mail/` behind basic auth with WebSocket upgrade headers); share the server with the friend's Tailscale account and allow shared users port 80 only; firewall: Tailscale interface only. **→ G0** (smoke script through both proxies).
- [ ] **D3-B1** (B · 1h) Testcontainers setup (same init script + **the migrate entry**, so the pg-boss tables exist) + transaction-rollback test; seed entry point (platform organization + admin — **users created through Better Auth's server API**, also when `REGISTRATION_OPEN=false`; organization and profile rows as owner; production passwords from env, refuses to run without them).
- [ ] **D3-AB1** (A 1.5h · B 1.5h) Fill in the programme's **Software Specification template**: A — overview, requirements, architecture, workflow, deployment; B — data model, permission matrix, money rules (link to `docs/decisions-9-11/` instead of copying).
- [ ] **D3-AB2** (A+B · 1h) Mentor meeting: `MENTOR-QUESTIONS.md`; agree the weekly check-in day.
- [ ] **D3-B2** (B · 2h) Catalogue migration from `schema/catalogue.ts` (with the decision-J change: 3 WebP sizes, no `thumb_key`; no trigram index) + grants for the catalogue tables + category & attribute seed from `seed-categories.md`.
- [ ] **D3-B3** (B · 0.5h) pino logger in web and worker.
- *A ≈ 7h, B ≈ 7.5h incl. the meeting; decide at 16:00 what moves.*

### D4 · Thu 26.11 — Orders schema, RLS, auth UI · **G1**
- [ ] **D4-B1** (B · 3.5h) Orders & finance migration from `schema/orders.ts` + `schema/finance.ts` (the brief's payment model unless the mentors object by Thu 09:00; invoice number = sequence; checkout locks only `cart_items`; edits as `APPLIED.md` lists); `money.ts` with `money-vectors.json` as test vectors + fast-check invariants.
- [ ] **D4-B2** (B · 2h) `rls.sql` (MVP part) as a numbered SQL migration — **with the edits listed in `APPLIED.md`** (invoice sequence inside `app.next_invoice_number()`, no `invoice_counters`, no `thumb_key`, column grant on `sub_orders`); `rls_tests.sql` edited only as `APPLIED.md` lists and run via `psql` in CI **against the real migrations** (init script → migrate entry → `psql -f rls_tests.sql`, not `run_db_tests.sh`, which builds from the drafts); adapt its Better Auth fixture rows to the generated tables; ADR "escape hatch: pointing `DATABASE_URL` at the owner turns RLS off"; development logs the RLS context on empty reads.
- [ ] **D4-B3** (B · 1h) Policy module: permission matrix as code + matrix-driven authorization test harness.
- [ ] **D4-AB1** (A+B · 1h) Walkthrough: B explains `rls.sql`, roles and the checkout transaction to A.
- [ ] **D4-A1** (A · 1h) UI shell: shadcn, design tokens, Inter `latin-ext`, layouts for `/buyer`, `/supplier`, `/admin`, auth layout, staging banner.
- [ ] **D4-A2** (A · 2h) Shared UI: shadcn components, DataTable wrapper, MoneyText, StatusBadge, OrgBadge; `error.tsx` / `not-found.tsx` mapped to typed domain errors.
- [ ] **D4-A3** (A · 2.5h) Auth UI: login, register (buyer or supplier company in one form), "Complete company setup".
- [ ] **D4-B4** (B · 0.3h) Update diagrams 08, 09, 11, 12 (`.mmd`) if anything changed during the migrations, before the specification links to them.
- [ ] **D4-AB2** (A+B · 0.5h) Specification submitted to the mentor; ERD frozen. **→ G1**
- *A ≈ 7h, B ≈ 8.3h incl. the walkthrough — if B runs over, D4-B3 moves to D5 morning.*

### D5 · Fri 27.11 — Categories, products, production pipeline
- [ ] **D5-B1** (B · 1h) Domain: supplier approve / reject + company profile updates (+ audit entries).
- [ ] **D5-B2** (B · 2.5h) Category services + attribute definitions (read from the seed, inherited down the tree, Zod schema generated from them).
- [ ] **D5-B3** (B · 3.5h) Product CRUD services (draft / active / archived, SKU unique per supplier); storage module (save / read / delete on the media volume); image upload route handler (5 MB, magic bytes, random file names).
- [ ] **D5-A1** (A · 3h) **CD production half:** approval gate, `deploy.sh production`, pre-deploy `pg_dump`, health gate (Postgres + migration version; Meilisearch, Mailpit and the worker reported as "degraded" but not blocking), automatic release tag; `horeca-prod` Compose project + `.env.production` (Mailpit UI at `/_mail/` behind basic auth); nightly `pg_dump` + media-archive cron; **one restore of a pre-deploy dump into a scratch container** (three logins, grants and the pg-boss schema must come back). **Manual rollback** = re-run the deploy with the previous SHA.
- [ ] **D5-A2** (A · 1h) Forgot / reset password UI; org switcher + org badge; route guards per org type (layouts + `proxy.ts`); catalogue for buyers only.
- [ ] **D5-A3** (A · 2.5h) Company profile pages (buyer locations, supplier bank details); admin supplier approval queue (approve / reject); PendingSupplierBanner.
- [ ] **D5-A4** (A · 1h) **Test PDF on staging:** render a one-page PDF with Playwright in the worker container (č ć š ž đ, within `mem_limit`). If it fails, switch to a PDF library now, not on D13.

### D6 · Sat 28.11 — Images, CSV import
- [ ] **D6-B1** (B · 2h) Image job: 3 WebP sizes 320 / 640 / 1280 (sharp); media route handler (login required, `Cache-Control: private, max-age=…, immutable`).
- [ ] **D6-B2** (B · 4h) CSV import job: streaming parse, row validation, report, confirm → upsert by (supplier, SKU); decimal comma only in `;` files; **stuck-import recovery** in the supplier's own context (the import job runs as `horeca_app` with the supplier actor and sets `failed` on error; a running import older than 30 min is treated as failed when the supplier opens imports or starts a new one; Cancel action).
- [ ] **D6-B3** (B · 1h) React Email base layout + password-reset e-mail wired to Better Auth (the reset pages are D5-A2; test end to end in Mailpit). *(moved from D2-B4)*
- [ ] **D6-A1** (A · 3h) Admin category management (tree: add / rename / deactivate — attribute definitions come from the seed); supplier "My products" table.
- [ ] **D6-A2** (A · 3h) Product form generated from the attribute schema; FileDropzone + image upload with progress; `srcset` image component.

### D7 · Sun 29.11 — Search, catalogue
- [ ] **D7-B1** (B · 3h) Meilisearch client + index settings (filterable / sortable attributes, typo tolerance off for SKU/GTIN; test "hladjenje" vs "hlađenje"), sync jobs (enqueued in the same transaction), visibility rules, `pnpm search:reindex`; visibility tests.
- [ ] **D7-B2** (B · 3h) `searchProducts(filters)` with a Zod filter schema: query, category subtree, price range, supplier, attribute filters (only once a category is chosen), facets, sort, pagination; Postgres re-fetch by ID; product detail query.
- [ ] **D7-A1** (A · 5h) Catalogue UI: search box, FilterSidebar, facet counts, product cards, pagination, all state in URL params; mobile bottom sheet.
- [ ] **D7-A2** (A · 2h) Product detail page.
- [ ] **D7-AB1** (A+B · 0.3h) Weekly Progress Report (if the check-in is this week).

## Week 2 — ordering and money

### D8 · Mon 30.11 — Cart, seed data
- [ ] **D8-B1** (B · 3h) Cart service (belongs to the buyer org), min order quantity and step; **`PricingResolver`** (base price only) used by cart.
- [ ] **D8-B2** (B · 1.5h) Cart authorization tests (buyer A vs buyer B, supplier cannot use cart).
- [ ] **D8-B3** (B · 2h) Seed: 3 suppliers' CSVs with realistic products (incl. č ć š ž đ), **dummy images per category** copied into the media folder, one CSV with deliberate bad rows.
- [ ] **D8-A1** (A · 3.5h) Cart UI: CartSupplierGroup, QuantityStepper, header cart count, empty states.
- [ ] **D8-A2** (A · 2h) Order e-mail templates (buyer confirmation, supplier new sub-order) in React Email.

### D9 · Tue 01.12 — Checkout
- [ ] **D9-B1** (B · 6h) Checkout transaction (decision 11.8, corrected): idempotency key; `cart_items … FOR UPDATE` (no product / supplier locks — they return 0 rows under RLS); revalidation inside the transaction; split per supplier; snapshots; commission rate resolved and snapshotted; ledger entries (sale, commission); invoice number (sequence) + pro-forma row; cart cleared; e-mails + invoice render job enqueued **in the same transaction**. Built as **`createOrder(source, lines)`**; `payment_method` stored; payment status separate from sub-order status.
- [ ] **D9-B2** (B · 1h) Tests: Σ sub-orders = order, payable + commission = gross; rollback (nothing persisted); idempotent re-submit; the chosen locking behaviour.
- [ ] **D9-A1** (A · 4h) Checkout UI: delivery location, payment method (pro-forma default), summary, "Place order (N sub-orders)", changed-lines re-confirm.
- [ ] **D9-A2** (A · 1.5h) Confirmation page.

### D10 · Wed 02.12 — Order views · **G2**
- [ ] **D10-B1** (B · 3h) Buyer order queries + supplier sub-order queries (own only); authorization tests.
- [ ] **D10-B2** (B · 1.5h) E2E happy path (Playwright) in the full suite.
- [ ] **D10-A1** (A · 3.5h) Buyer "My orders" list / detail (payment status); supplier sub-orders list / detail ("order paid?").
- [ ] **D10-AB1** (A+B · 1h) **G2** run-through on staging; fix blockers.

### D11 · Thu 03.12 — Commission, ledger, payments
- [ ] **D11-B1** (B · 2.5h) Supplier balance (Σ entries) + commission per supplier; record payout / adjustment (platform, audited).
- [ ] **D11-B2** (B · 2h) Record buyer payment / refund (`order_payments`, platform, audited); derived payment status.
- [ ] **D11-B3** (B · 2h) Tests: balance = Σ entries, payment status derivation (unpaid / paid / refund_due).
- [ ] **D11-A1** (A · 2h) Supplier ledger UI (balance, entries).
- [ ] **D11-A2** (A · 3.5h) Admin commission & ledgers screen (KPIs, per-supplier owed, default-rate form, record payout / adjustment).

### D12 · Fri 04.12 — Sub-order lifecycle, seeded orders
- [ ] **D12-B1** (B · 3.5h) Sub-order state machine (`transition()`), events, cancellation with reversal ledger entries, order status via `app.recompute_order()`; status e-mails.
- [ ] **D12-B2** (B · 1.5h) State machine + cancellation tests (a cancelled sub-order's entries sum to 0).
- [ ] **D12-B3** (B · 2h) Seed **8–10 orders in several states** through `createOrder` and `transition` as real actors (so supplier and admin screens are not empty).
- [ ] **D12-A1** (A · 3.5h) Sub-order detail: legal-transition buttons, StepperTimeline, status-change e-mail template; buyer order timeline.
- [ ] **D12-A2** (A · 2h) Admin all-orders list with filters.

### D13 · Sat 05.12 — Pro-forma PDF, admin · DoD on staging
- [ ] **D13-B1** (B · 3.5h) Invoice render job (Playwright in the worker, from `content_snapshot`, stored on the media volume, idempotent); download route handler (buyer + platform only) that **re-enqueues the job when the file is missing**; invoice link in the order e-mail and order detail.
- [ ] **D13-B2** (B · 1h) Tests: re-run job is a no-op, supplier cannot download (404).
- [ ] **D13-B3** (B · 1.5h) E2E Definition-of-Done suite (incl. supplier B → supplier A's URL → not found).
- [ ] **D13-A1** (A · 3h) Invoice HTML template (A4, print CSS, repeated headers, page X of Y, embedded fonts).
- [ ] **D13-A2** (A · 2.5h) Admin overview; record buyer payment / refund panel on the admin order detail.
- [ ] **D13-AB1** (A+B · 1h) **Definition of Done on staging**; fix blockers.

### D14 · Sun 06.12 — Production · **G3**
- [ ] **D14-B1** (B · 3h) Full authorization matrix tests incl. IDOR with real foreign IDs (every action × org type × role × own / foreign).
- [ ] **D14-B2** (B · 1h) Rate limits: Better Auth defaults + one custom sign-in rule; one active CSV import per supplier (already a DB rule). Production seed with env passwords.
- [ ] **D14-A1** (A · 2h) Security headers; accessibility pass (keyboard, contrast, axe); "works on a phone" check.
- [ ] **D14-A2** (A · 1h) Production deploy + seed; `REGISTRATION_OPEN=false` on production if wanted.
- [ ] **D14-AB1** (A+B · 2h) **G3** run-through on production; **first demo rehearsal** (MVP script) + backup screen recording; laptop fallback (full stack with seed via Docker Compose) tested once.
- [ ] **D14-AB2** (A+B · 0.3h) Weekly Progress Report (if the check-in is this week).

## Week 3 — stretch, freeze, demo

### D15 · Mon 07.12 — S1 pricing
- [ ] **D15-B1** (B · 4h) S1: price tiers + buyer-specific prices behind `PricingResolver` (precedence buyer > tier > base, validity window); snapshots store the applied price.
- [ ] **D15-B2** (B · 2h) S1 tests: precedence, visibility (buyer B never sees buyer A's price), cart total = order total.
- [ ] **D15-A1** (A · 3h) S1 UI: supplier tier & buyer-price editor; tier / your-price display in catalogue and cart.
- [ ] **D15-A2** (A · 3h) Buffer: MVP bugs and UI polish found in the G3 rehearsal.

### D16 · Tue 08.12 — S3 AI normalisation
- [ ] **D16-B1** (B · 4h) Server-side Claude client (`AI_ENABLED`, off by default; key/model from env; rate limit + daily cost cap stored in one small usage table; no personal data; JSON validated with the generated attribute Zod schema; fallback); normalisation as a job.
- [ ] **D16-B2** (B · 1.5h) Tests: invalid JSON, off-schema values, prompt-injection text, timeout fallback (model mocked in CI — CI never calls the API).
- [ ] **D16-A1** (A · 3h) AiSuggestion UI on the product form (per-field accept / edit / reject; never auto-saves).
- [ ] **D16-A2** (A · 2h) Evaluation set: 15 messy descriptions with expected attributes; accuracy in README.

### D17 · Wed 09.12 — S4 NL search · S5 RFQ start
- [ ] **D17-B1** (B · 3h) S4: query → filter object (same Zod filter schema) → `searchProducts()`; falls back to plain search.
- [ ] **D17-B2** (B · 3h) S5: RFQ migration + request and quote services (only invited suppliers see an RFQ).
- [ ] **D17-A1** (A · 2h) S4: interpreted-filter chips ("Interpreted from your search", each removable).
- [ ] **D17-A2** (A · 3.5h) S5: buyer RFQ create + list; supplier RFQ inbox + quote form.

### D18 · Thu 10.12 — S5 RFQ finish · S6 payment start
- [ ] **D18-B1** (B · 2.5h) S5: accept quote → **`createOrder(source = rfq)`**; tests (accept twice, expired quote).
- [ ] **D18-B2** (B · 3.5h) S6: `PaymentProvider` interface, mock provider, payment state machine, HMAC-signed callback (constant-time verify, dedupe by event ID, amount check).
- [ ] **D18-A1** (A · 2.5h) S5: buyer quote comparison + accept.
- [ ] **D18-A2** (A · 3h) S6: mock hosted payment page (route handler) + card option in checkout + payment status UI.

### D19 · Fri 11.12 — S6 finish · **G4 freeze (EOD)**
- [ ] **D19-B1** (B · 2.5h) S6 tests: duplicate / forged / out-of-order callback; browser closed before redirect.
- [ ] **D19-B2** (B · 2h) E2E for finished stretch features.
- [ ] **D19-A1** (A · 3h) Stretch UI polish; production deploy.
- [ ] **D19-AB1** (A+B · 0.5h) **Feature freeze.** Unfinished stretch → Known limitations.

### Only if time (before G4)
- [ ] **S2-A1** (A · 3h) Product compare: select up to 4, side-by-side attribute table; "also offered by another supplier" (same GTIN).
- [ ] **S7-B1** (B · 2h) Member invitations: Better Auth invitations through the e-mail pipeline, owner only.
- [ ] **S7-A1** (A · 2h) Members page + accept-invitation page.

### D20 · Sat 12.12 — Polish & docs
- [ ] **D20-A1** (A · 4h) UX pass on all screens (loading / empty / error states, 360 / 768 widths, accessibility fixes).
- [ ] **D20-B1** (B · 3h) Bug fixes from the pass; money regression run across all order sources.
- [ ] **D20-AB1** (A+B · 2h) Specification as-built, README (limitations, AI evaluation, cost), diagrams regenerated.
- [ ] **D20-AB2** (A+B · 2h) 10-minute presentation slides (problem, architecture, decisions, limitations, learnings).

### D21 · Sun 13.12 — Release & rehearsal
- [ ] **D21-AB1** (A+B · 1h) Reset demo data on production; cut **`v1.0.0`**.
- [ ] **D21-AB2** (A+B · 2h) Demo rehearsals with timer, incl. failure paths; backup screen recording.
- [ ] **D21-AB3** (A+B · 0.3h) Weekly Progress Report (if the check-in is this week).

---

## Final demo script (10 min) — MVP; stretch scenes added only once they ship
1. **Problem** (1 min): fragmented PDF catalogues, several intermediaries.
2. **Supplier** (2 min): CSV with bad rows → report → import; product appears in search. *(+ S3: AI suggests attributes for a messy description.)*
3. **Buyer** (3 min): typo search ("frizider") → filters → cart from 3 suppliers → checkout → 3 sub-orders → pro-forma PDF → e-mails in the Mailpit inbox. *(+ S4 natural-language search, + S1 tier price.)*
4. **Supplier / admin** (2 min): supplier sees only its sub-order; supplier B opens supplier A's URL → not found; admin records the payment and sees commission per supplier; org switcher.
5. **Failure paths** (1.5 min): price changed during checkout → re-confirm; cancellation → ledger reversal. *(+ S6 duplicate payment callback → no-op.)*
6. **Engineering** (30 s): pipeline staging → approval → production → release tag; honest limitations.
