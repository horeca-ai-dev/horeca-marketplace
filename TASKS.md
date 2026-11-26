# TASKS.md — HoReCa B2B Marketplace

**21 days, 7 days a week:** Mon 23.11.2026 (D1) → Sun 13.12.2026 (D21). Final demo date: set by mentors.

| Owner | Focus |
|---|---|
| **A** = @BogdanD3 | Infrastructure, CI/CD, database operations, frontend |
| **B** = @MarkoBojovich | Domain layer, database schema & migrations, background jobs, seed data, E2E test suites |

> **Decision 012 (25.11) applied:** three purchase modes, contracts, mock card gateway (MVP), supplier stock API, admin-onboarded suppliers, Montenegrin UI — see [`docs/decisions/012-purchase-modes-payments-stock.md`](docs/decisions/012-purchase-modes-payments-stock.md) §13. Estimates marked *(012 est.)* are new or revised for that decision.

> **Decision 013 (26.11) applied:** media in S3-compatible storage (self-hosted Garage) instead of a Docker volume — see [`docs/decisions/013-s3-compatible-storage-garage.md`](docs/decisions/013-s3-compatible-storage-garage.md) "Plan changes": new **D4-A5** and **D5-A5**, D5-B3 / D6-B1 on the S3 API, Garage in the integration setup. To keep A's D4 within 8.5h, **D4-A2 moved to D5** and **D5-A4 to D6**. Marked *(013)*.

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
| **G1 Spec submitted & schema migrated** | Thu 26.11 (D4) EOD spec + order core · Fri 27.11 (D5) EOD second migration | The programme's Software Specification **submitted** to the mentor (D4) · the schema from `docs/decisions-9-11` + `APPLIED.md` (incl. §4 Decision 012) implemented as migrations: **D4 order-core migration**, **D5 second migration** (contracts, payments, stock, `system_cancel_sub_order`) · RLS on and `rls_tests.sql` green in CI · both members can explain `rls.sql` · **ERD frozen D5 EOD** |
| **G2 Happy path** | Wed 02.12 (D10) EOD | On staging: supplier products (with **stock badges**) → search → cart → checkout of a **direct** order under an **active contract** → sub-orders → each supplier sees only its own |
| **G3 MVP** | Sun 06.12 (D14) EOD | Definition of Done passes **on staging by Sat 05.12 evening** and **on production on Sun 06.12**: products from ≥ 3 suppliers found with filters, one order, each supplier sees only its sub-order, admin sees commission per supplier, cross-supplier access fails · **one successful card payment** (mock gateway) with its **pro-forma PDF** · CI green. Failure scenes (declined card, forged / replayed callback, expiry, supplier API down) follow on D15–D16 |
| **G4 Feature freeze** | Fri 11.12 (D19) EOD | "Create supplier" (D16-B0 / D16-A0, MVP) finished on D16 · no new features; D20–D21 polish, docs, rehearsal, `v1.0.0` |

## Stretch
Stretch work starts only after G3. Each item plugs into a **seam built during the MVP**, so it adds code instead of rewriting it.

**Planned — the brief's stretch goals, in this order: S3 → S4 → S1 → S5.** Realistically **1–2** of them, from D17 (decision 012). S6 (card payment) is **no longer stretch** — the mock gateway is MVP.
| # | Stretch | Seam built in the MVP |
|---|---|---|
| S3 | AI attribute normalisation | Attribute → Zod schema generation (D5), CSV import (D6) |
| S4 | AI natural-language search | `searchProducts(filters)` with a Zod filter schema (D7) + S3's AI client |
| S1 | Volume pricing tiers + buyer-specific prices | `PricingResolver` in cart & checkout (D8) |
| S5 | Request for quote (RFQ) — not the same as contracts (012 §3) | `createOrder(source, lines)` (D9) |

**Only if time** (not in the brief's stretch list): **S2** product compare · **S7** member invitations — tasks at the end of this file.
Whatever is not finished at G4 goes into README → Known limitations. If something slips, the last planned stretch goal moves out first (S5, then S1).

## After the project (not scheduled — do not open before the project is finished)
| Item | ≈ Time |
|---|---|
| Sentry error tracking (SDK + project) | 1.5h |
| External uptime monitor | 0.5h |
| Admin Jobs page (queue counts, failed jobs, retry) | 1h |
| Audit-log viewer screen (the audit table itself is written from day one) | 1h |
| Attribute-definition editor in the admin UI (definitions come from the seed) | 2h |
| Supplier suspend / reinstate screens (the rules exist in the database; re-apply is gone with decision 012) | 1h |

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
  - Tailscale: create the **federated identity** credential (workload identity federation; subject `repo:horeca-ai-dev@360824986/horeca-marketplace@1470667672:environment:*`, tag `tag:ci`) and add the grant `tag:ci` → only `tcp:22` on the server now; store `TS_OAUTH_CLIENT_ID` and `TS_AUDIENCE` in both GitHub Environments (not sensitive).
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
- [x] **D2-A3** (A · 1h) `docker-compose.dev.yml`: Postgres 16 with an **init shell script** (it must read the passwords from env) that creates the three logins (`horeca_owner` = non-superuser, `horeca_app`, `horeca_worker`) and the database **owned by `horeca_owner`**; Meilisearch 1.56; Mailpit — all ports on `127.0.0.1`; exact image versions pinned. The init script runs **only on an empty data directory**, as the image's superuser (`POSTGRES_PASSWORD`), so `deploy.sh staging-reset <sha>` must remove the volume. The same script is used by Testcontainers and on the server.
- [x] **D2-A4** (A · 3h) Dockerfile: Node 26; Next.js `standalone` for web; **worker and migrate entries bundled separately (tsup/esbuild) with their own `node_modules`** (pg-boss, sharp, Playwright, Drizzle migrator, migrations folder); Chromium via `playwright install --with-deps chromium` + fonts with č ć š ž đ; build-time switch that skips env validation; media volume mount point; `src/env.ts`; `/api/health`.
- [x] **D2-B1** (B · 1h) Drizzle config, db clients (app + worker logins), `withTx()` / `withSystemTx()`, runtime migrator, `pnpm db:*` scripts; **migration 0000 = the `ltree` extension only**. The app connects as `horeca_app` from the first commit.
- [x] **D2-B2** (B · 3h) Better Auth (email + password, organization plugin) — **locked down:** `allowUserToCreateOrganization: false`, organization deletion off, organizations created server-side by our registration — **buyers only** (decision 012 §8; suppliers are created by the seed, later also by the admin, D16-B0) — (organization + member + `org_profiles` in our transaction; the user row comes from Better Auth first — a user left without an organization goes to "Complete company setup"); review every plugin endpoint (update / invite / remove) and disable what bypasses the domain layer; `trustedOrigins` = both domains; client-IP header for its rate limiter; `REGISTRATION_OPEN` switch. Migration: Better Auth tables from its CLI (replacing the placeholder) + `org_profiles`, `supplier_profiles`, `buyer_locations` from `schema/identity-ext.ts` **+ the grants for these tables** (what `rls.sql` §3 gives `horeca_app` and `horeca_worker`) — without them `horeca_app` gets "permission denied" and register/login fail at G0. Policies and `ENABLE ROW LEVEL SECURITY` stay on D4. Registration as in `APPLIED.md` (organization + member rows inserted directly in our transaction).
- [x] **D2-B3** (B · 1.5h) Domain scaffold: `Actor`, `resolveActor()` (session + membership re-check), `policy.can()` stub, typed domain errors, next-safe-action client with actor middleware, `serverActions.allowedOrigins` = both domains; one **throwaway page with a single Server Action** for the G0 check; `money.ts` stub + first fast-check test.
- [x] **D2-B4** (B · 2h) **Jobs baseline:** pg-boss schema installed and queues created by the **migrate** entry (owner); web and worker start with `migrate: false` (web also without supervision and scheduling); grants on the pg-boss schema for `horeca_app` (send) and `horeca_worker` (fetch / complete) — check the exact grants against the pinned version (**time-box 45 min** — if unclear, grant the worker everything on the pg-boss schema and narrow later); `enqueue(tx, …)` inside the Drizzle transaction + **one test that a rolled-back transaction leaves no job**; `worker.ts`; `sendEmail()` over SMTP (Mailpit). *(React Email layout + password-reset e-mail moved to D6-B3.)*
- *A ≈ 6.5h, B ≈ 7.5h. Continues on D3 — G0 is Wednesday end of day.*

### D3 · Wed 25.11 — Skeleton part 2 (G0 EOD) · specification · mentor meeting
- [x] **D3-B0** (B · 1.5h) **CI workflow:** lint, format, typecheck, commitlint, gitleaks, audit, unit, integration with Testcontainers, RLS SQL tests via `psql` (from D4), migration check (`drizzle-kit check` + the **migrate entry** on an empty database, so the pg-boss schema exists too), build.
- [x] **D3-A1** (A · 1.5h) **CD staging half:** GHCR (image package public) → Tailscale GitHub Action `tailscale/github-action@v4` with federated identity (`permissions: id-token: write`; `oauth-client-id` / `audience` from `TS_OAUTH_CLIENT_ID` / `TS_AUDIENCE`; `tags: tag:ci`; deploy jobs run in the `staging` / `production` Environments so the subject matches; grant: `tcp:22` to the server only) → `deploy.sh staging <sha>` → migrate → health → **G0 smoke script** (written here; uses the staging basic-auth credentials from a GitHub secret).
- [x] **D3-A2** (A · 3h) Server: `deploy` user + `deploy.sh` (ends with an image prune keeping the last five SHAs); `horeca-staging` Compose project (`mem_limit`, log rotation, media volume, Mailpit); `/opt/horeca/staging/.env` incl. the three database passwords; our Nginx on the Tailscale address only, port `8081` (shared with production, split by `server_name`) (→ `127.0.0.1:3101`, basic auth, `set_real_ip_from` = friend's Tailscale IP + `real_ip_header X-Forwarded-For` (the friend's proxy overwrites it with the real visitor IP), `X-Forwarded-Proto` passed through, Mailpit UI at `/_mail/` behind basic auth with WebSocket upgrade headers); share the server with the friend's Tailscale account and allow shared users port 8081 only. **→ G0** (smoke script through both proxies).
- [x] **D3-B1** (B · 1.5h) *(012 est.)* Testcontainers setup (same init script + **the migrate entry**, so the pg-boss tables exist) + transaction-rollback test; seed entry point (platform organization + admin **+ the demo organizations from README → Demo accounts — 3 suppliers created directly as `approved`, 2 buyers, the multi-org user** (registration is buyer-only and the admin screen comes on D16, so the seed is how suppliers exist until then) — **users created through Better Auth's server API**, also when `REGISTRATION_OPEN=false`; organization and profile rows as owner; production passwords from env, refuses to run without them).
- [ ] **D3-AB1** (A 1.5h · B 1.5h) Fill in the programme's **Software Specification template**: A — overview, requirements, architecture, workflow, deployment; B — data model, permission matrix, money rules (link to `docs/decisions-9-11/` instead of copying).
- [x] **D3-AB2** (A+B · 1h) Mentor meeting: `MENTOR-QUESTIONS.md`; agree the weekly check-in day. *(Held 25.11 — outcome: decision 012.)*
- [x] **D3-B2** (B · 2h) Catalogue migration from `schema/catalogue.ts` (with the decision-J change: 3 WebP sizes, no `thumb_key`; no trigram index) + grants for the catalogue tables + category & attribute seed from `seed-categories.md`.
- [x] **D3-B3** (B · 0.5h) pino logger in web and worker.
- [ ] **D3-A4** (A · 1h) *(012 est.)* **i18n is MVP:** `next-intl` with **Montenegrin (Latin)** messages from the start — UI, validation and domain error messages, e-mails, invoice PDF, CSV reports; code, logs and docs stay English (decision 012 §10). No longer optional.
- *A ≈ 8h, B ≈ 8h incl. the meeting; decide at 16:00 what moves.*

### D4 · Thu 26.11 — Order-core migration, RLS, auth UI · **G1 (spec + order core)**
- [ ] **D4-A0** (A · 2h) **Design direction** written into `DESIGN.md` before the first screens: typography, colour, layout rhythm, motion — distinctive, clearly better than a generic design (decision 012 §10).
- [x] **D4-B1** (B · 4h) *(012 est.)* **Order-core migration** from `schema/orders.ts` + `schema/finance.ts` with the edits in `APPLIED.md` §2 **and §4 · D4-B1**: `sub_orders.mode` (`direct` | `platform`), `sub_orders.supplier_submission`, `orders.payment_status` + `not_applicable`, `orders.payment_method` removed, ledger `commission_payment` + sign rule + policy edits, invoice totals = platform part, `recompute_order` counts platform sub-orders only; invoice number = sequence; checkout locks only `cart_items`; `money.ts` with `money-vectors.json` as test vectors + fast-check invariants (incl. direct: entries sum to −commission).
- [x] **D4-B2** (B · 2.5h) *(012 est.)* `rls.sql` (MVP part) as a numbered SQL migration — **with the edits listed in `APPLIED.md`** (§2, and §4 · D4-B2: `org_profiles_insert` / `supplier_profiles_insert` allow the platform; `app.org_profiles_guard()` lets only the platform insert a supplier profile, as `approved`; pending-supplier and re-apply tests replaced) (invoice sequence inside `app.next_invoice_number()`, no `invoice_counters`, no `thumb_key`, column grant on `sub_orders`); `rls_tests.sql` edited only as `APPLIED.md` lists and run via `psql` in CI **against the real migrations** (init script → migrate entry → `psql -f rls_tests.sql`, not `run_db_tests.sh`, which builds from the drafts); adapt its Better Auth fixture rows to the generated tables; ADR "escape hatch: pointing `DATABASE_URL` at the owner turns RLS off"; development logs the RLS context on empty reads.
- [x] **D4-B3** (B · 1h) Policy module: permission matrix as code + matrix-driven authorization test harness.
- [ ] **D4-AB1** (A+B · 1h) Walkthrough: B explains `rls.sql`, roles and the checkout transaction to A.
- [ ] **D4-A1** (A · 1h) UI shell: shadcn, design tokens, **Schibsted Grotesk** (chosen in D4-A0) committed as local files with its OFL licence and loaded via `next/font/local` (`latin` + `latin-ext`; no download at build time), layouts for `/buyer`, `/supplier`, `/admin`, auth layout, staging banner.
- [ ] **D4-A3** (A · 2h) *(012 est.)* Auth UI: login, register (**buyer company only** — suppliers are created by the admin), "Complete company setup" (buyers), all in Montenegrin.
- [x] **D4-A5** (A · 1.5h) *(013)* **Local Garage:** `dxflrs/garage` 2.x (exact pin) in `docker-compose.dev.yml` — single node, replication factor 1, data + meta volumes, S3 API on `127.0.0.1:3900` only (admin API and RPC not published); `deploy/garage/garage.toml` with `rpc_secret` / `admin_token` from `.env`; idempotent `scripts/garage-setup.sh` (layout, bucket `horeca-media`, app key with read/write, key printed once); `.env.example` S3 + Garage variables; README "Local S3 (Garage)". The config file and the script are reused by the D5 server task (D5-A5) and by B's Garage container in the integration setup (D5-B3) — no Testcontainers helper here.
- [x] **D4-B4** (B · 0.3h) Update diagrams 08, 09, 11, 12 (`.mmd`) if anything changed during the migrations, before the specification links to them.
- [ ] **D4-AB2** (A+B · 0.5h) Specification submitted to the mentor (with decision 012). **→ G1 part 1** (ERD freeze moves to D5 EOD).
- *A ≈ 8h (+1.5h D4-A5, −2h D4-A2 → D5; 013), B ≈ 9.3h incl. the walkthrough — **B 0.8h over 8.5h, accepted** (no clean move: B has no free hour D5–D12, D4-B3's harness is needed by D8-B2, D4-B4 must precede the spec). If B runs over, D4-B3 moves to D5 morning.*

### D5 · Fri 27.11 — Second migration, categories, products, production pipeline · **G1 (ERD freeze)**
- [ ] **D5-B0** (B · 3h) **Second migration** per `APPLIED.md` §4 · D5-B0: `supplier_agreements` (+ policies, column grant, tests), `payments` + `refunded_cents`, `payment_events`, `product_stock` (+ read policy, worker write), `app.system_cancel_sub_order()` (+ tests). **ERD freeze D5 EOD. → G1**
- [ ] **D5-B2** (B · 2.5h) Category services + attribute definitions (read from the seed, inherited down the tree, Zod schema generated from them).
- [ ] **D5-B3** (B · 3.5h) *(013 +1h)* Product CRUD services (draft / active / archived, SKU unique per supplier); **storage module on the S3 API** (decision 013: `put`, `get` (stream), `delete`, `head`, `list`; standard S3 client library at an exact pinned version — ask before adding it; `S3_*` variables in `src/env.core.ts`, `MEDIA_DIR` removed from env, `.env.example` and the Dockerfile); **Garage container in the integration setup** (Testcontainers; image read from `docker-compose.dev.yml` like Postgres, same `deploy/garage/garage.toml` and setup steps). *(Image upload route → D6-B0.)*
- [ ] **D5-A1** (A · 3h) **CD production half:** approval gate, `deploy.sh production`, pre-deploy `pg_dump`, health gate (Postgres + migration version; Meilisearch, Garage, Mailpit and the worker reported as "degraded" but not blocking), automatic release tag; `horeca-production` Compose project + `/opt/horeca/production/.env` (Mailpit UI at `/_mail/` behind basic auth); production Nginx site on plain `listen <SERVER_TAILSCALE_IP>:8081;` (the `default_server` for that address:port already lives in the staging site); nightly `pg_dump` cron (media backup → D5-A5); **one restore of a pre-deploy dump into a scratch container** (three logins, grants and the pg-boss schema must come back). **Manual rollback** = re-run the deploy with the previous SHA.
- [ ] **D5-A5** (A · 1.5h) *(013)* **Garage on the server**, with D5-A1: a `garage` service in `deploy/compose.yml` for staging and production (no `ports:`, `mem_limit` ≈ 128m, data + meta volumes, `deploy/garage/garage.toml`); `scripts/garage-setup.sh` run once per environment (`COMPOSE_FILE` + `COMPOSE_PROJECT_NAME`); S3 + Garage variables in both `/opt/horeca/<env>/.env` and `deploy/env.staging.example`; the media volume removed from web / worker; `backup.sh`: media as an S3-API copy (`rclone sync` in a one-off container → `/var/backups/horeca/<env>/media/`) instead of a volume archive; README image / deploy-file rows updated. **Must be on staging before D5-B3 merges** — once `env.core.ts` requires the S3 variables, the web refuses to boot without them.
- [ ] **D4-A2** (A · 2h) *(moved from D4 — 013; do it first, D5-A2 needs OrgBadge, D6-A1 needs DataTable)* Shared UI: shadcn components, DataTable wrapper, MoneyText, StatusBadge, OrgBadge; `error.tsx` / `not-found.tsx` mapped to typed domain errors.
- [ ] **D5-A2** (A · 1h) Forgot / reset password UI; org switcher + org badge; route guards per org type (layouts + `proxy.ts`); catalogue for buyers only.
- [ ] **D5-A3** (A · 1.5h) Company profile pages (buyer locations, supplier bank details). *("Create supplier" form → D16-A0, with its domain task D16-B0.)*
- *A ≈ 9h (+1.5h D5-A5, +2h D4-A2, −1h D5-A4 → D6; 013 — 0.5h over, accepted), B ≈ 9h (D5-B3 +1h; 013).*

### D6 · Sat 28.11 — Images, CSV import
- [ ] **D6-B0** (B · 1h) Image upload route handler (5 MB, magic bytes, random file names) — moved from D5-B3; used by D6-A2.
- [ ] **D6-B1** (B · 2.5h) *(013 +0.5h)* Image job **via S3**: reads the original from the bucket, writes the 3 WebP sizes 320 / 640 / 1280 (sharp) back; media route handler streams from S3 (login required, `Cache-Control: private, max-age=…, immutable`).
- [ ] **D6-B2** (B · 4h) CSV import job: streaming parse, row validation, report, confirm → upsert by (supplier, SKU); decimal comma only in `;` files; **stuck-import recovery** in the supplier's own context (the import job runs as `horeca_app` with the supplier actor and sets `failed` on error; a running import older than 30 min is treated as failed when the supplier opens imports or starts a new one; Cancel action).
- [ ] **D6-B3** (B · 1h) React Email base layout + password-reset e-mail wired to Better Auth (the reset pages are D5-A2; test end to end in Mailpit). *(moved from D2-B4)*
- [ ] **D6-A1** (A · 1.5h) Supplier "My products" table. *(Admin category management → D14-A3; categories come from the seed until then.)*
- [ ] **D6-A2** (A · 3h) Product form generated from the attribute schema; FileDropzone + image upload with progress; `srcset` image component.
- [ ] **D6-A3** (A · 3h) **`mock-services` app** — fourth entry point of the existing image, its own container per environment, state in memory seeded on start from the catalogue data — with the **supplier stock API**: `GET /suppliers/{id}/stock?skus=…`, `POST /suppliers/{id}/orders` (idempotent by sub-order ID; decrements stock, may reject lines); behaviours per supplier: normal · down (503) · some SKUs out of stock (decision 012 §7–§8).
- [ ] **D5-A4** (A · 1h) *(moved from D5 — 013)* **Test PDF on staging:** render a one-page PDF with Playwright in the worker container (č ć š ž đ, within `mem_limit`). If it fails, switch to a PDF library now, not on D13.
- *A ≈ 8.5h (+1h D5-A4; 013), B ≈ 8.5h (D6-B1 +0.5h; 013).*

### D7 · Sun 29.11 — Search, catalogue
- [ ] **D7-B1** (B · 3h) Meilisearch client + index settings (filterable / sortable attributes, typo tolerance off for SKU/GTIN; test "hladjenje" vs "hlađenje"), sync jobs (enqueued in the same transaction), visibility rules, `pnpm search:reindex`; visibility tests.
- [ ] **D7-B2** (B · 3h) `searchProducts(filters)` with a Zod filter schema: query, category subtree, price range, supplier, attribute filters (only once a category is chosen), facets, sort, pagination; Postgres re-fetch by ID; product detail query.
- [ ] **D7-B3** (B · 2h) *(012 est.)* **Stock sync:** scheduled pg-boss job every 5 min fills `product_stock` from the supplier stock API (`ok` | `unknown`, `fetched_at`); stock badge value in the search index (no filter in the MVP). Stock is never imported from CSV.
- [ ] **D7-A1** (A · 5.5h) *(012 est.)* Catalogue UI: search box, FilterSidebar, facet counts, product cards **+ stock badge**, pagination, all state in URL params; mobile bottom sheet.
- [ ] **D7-A2** (A · 2h) Product detail page.
- [ ] **D7-AB1** (A+B · 0.3h) Weekly Progress Report (if the check-in is this week).
- *A ≈ 7.8h, B ≈ 8.3h.*

## Week 2 — ordering and money

### D8 · Mon 30.11 — Cart, seed data
- [ ] **D8-B1** (B · 3h) Cart service (belongs to the buyer org), min order quantity and step; **`PricingResolver`** (base price only) used by cart.
- [ ] **D8-B2** (B · 1.5h) Cart authorization tests (buyer A vs buyer B, supplier cannot use cart).
- [ ] **D8-B4** (B · 4h) **Contracts:** domain services `agreement.request` / `.accept` / `.reject` / `.end` / `.view`, policies + authorization-matrix entries, e-mails (request → supplier; decision → buyer).
- [ ] **D8-A1** (A · 4.5h) *(012 est.)* Cart UI: CartSupplierGroup **with the per-supplier mode choice** (contract active → "Order directly under our contract" or "Pay by card"; no contract → "Pay by card" + "Request a contract"; requested → "Pay by card"), QuantityStepper, header cart count, empty states.
- [ ] **D8-A2** (A · 2h) Order e-mail templates (buyer confirmation, supplier new sub-order) in React Email.
- [ ] **D8-A3** (A · 2h) **Generated seed** (moved from D8-B3; until the scraped data arrives on D13-A3): CSVs with realistic products for the 3 seeded suppliers (incl. č ć š ž đ), **dummy images per category** uploaded to the bucket (through the storage module), one CSV with deliberate bad rows; stock values for `mock-services` come from the same data.
- *A ≈ 8.5h, B ≈ 8.5h.*

### D9 · Tue 01.12 — Checkout
- [ ] **D9-B1** (B · 7h) *(012 est.)* Checkout **with modes** (decision 012 §4, §7): a fresh **stock check per supplier in the request before the transaction** (2–3 s timeout; API down → that group cannot be ordered, the others can); `direct` only with an `active` contract (revalidated inside the transaction); **direct-mode commission** (ledger: `commission` only); **submission job for direct** sub-orders after commit. Checkout transaction (decision 11.8, corrected): idempotency key; `cart_items … FOR UPDATE` (no product / supplier locks — they return 0 rows under RLS); revalidation inside the transaction; split per supplier; snapshots; commission rate resolved and snapshotted; ledger entries (sale, commission); invoice number (sequence) + pro-forma row; cart cleared; e-mails + invoice render job enqueued **in the same transaction**; pro-forma only for the **platform part**. Built as **`createOrder(source, lines)`**; mode stored per sub-order; payment status separate from sub-order status.
- [ ] **D9-B2** (B · 1.5h) *(012 est.)* Tests: Σ sub-orders = order; platform: payable + commission = gross; direct: entries sum to −commission; direct refused without an active contract; rollback (nothing persisted); idempotent re-submit; the chosen locking behaviour.
- [ ] **D9-A1** (A · 4h) Checkout UI **per mode**: delivery location, mode per supplier group, summary, "Place order (N sub-orders)", changed-lines re-confirm, "availability unknown" groups blocked; **redirect to the gateway** for the platform part.
- [ ] **D9-A2** (A · 1.5h) Confirmation page.
- [ ] **D9-A3** (A · 2.5h) **Contract UI, part 1:** request a contract (from the cart's supplier group and the supplier page); supplier inbox (accept / reject).
- *A ≈ 8h, B ≈ 8.5h.*

### D10 · Wed 02.12 — Order views, contracts, gateway page · **G2**
- [ ] **D10-B1** (B · 3h) Buyer order queries + supplier sub-order queries (own only); authorization tests.
- [ ] **D10-B2** (B · 1.5h) E2E happy path (Playwright) in the full suite — **direct order under an active contract**, stock badges visible.
- [ ] **D10-B3** (B · 3h) **Gateway API** in `mock-services` (decision 012 §6): `POST /payments`, `GET /payments/{id}`, **signed callback** (HMAC-SHA256 over the raw body, timestamp) **with retry**, admin **"replay last callback"** (basic auth), test cards **success** / **declined**. Needed by D11-B2; the hosted page is D10-A3.
- [ ] **D10-A1** (A · 3.5h) Buyer "My orders" list / detail (mode + payment status per sub-order); supplier sub-orders list / detail (mode, "order paid?").
- [ ] **D10-A3** (A · 3h) **Gateway hosted page** in `mock-services` (fixed banner "TEST — do not enter a real card"; test cards **success** / **declined** only; numbers never logged or stored) + our **return / status page**.
- [ ] **D10-AB1** (A+B · 1h) **G2** run-through on staging; fix blockers.
- *A ≈ 7.5h, B ≈ 8.5h.*

### D11 · Thu 03.12 — Commission, ledger, card payments
- [ ] **D11-B1** (B · 3h) *(012 est.)* Supplier balance (Σ entries, may be negative) + commission per supplier; record payout / adjustment **+ `commission_payment` (direct mode)** (platform, audited).
- [ ] **D11-B2** (B · 4.5h) *(012 est.)* **Payment integration** (decision 012 §6): `PaymentProvider.createPayment` in the web request after commit (API key, idempotency key, 2–3 s timeout; failure → "Pay now" on the order page); `payments` `created → pending`; **callback route handler** = verify HMAC (raw body, constant time, timestamp tolerance) + enqueue one job only; **worker processing** (dedupe by event ID, amount + currency check, `order_payments` receipt / refund, `recompute_order`); **submission of platform sub-orders after payment**. *(Expiry + gateway status query → D15-B0.)*
- [ ] **D11-B3** (B · 1h) Tests: balance = Σ entries, payment status derivation (unpaid / paid / refund_due / not_applicable). *(Duplicate-event and forged-signature tests → D15-B1.)*
- [ ] **D11-A1** (A · 2h) Supplier ledger UI (balance, entries).
- [ ] **D11-A2** (A · 3.5h) Admin commission & ledgers screen (KPIs, per-supplier owed, default-rate form, record payout / adjustment).
- [ ] **D11-A3** (A · 3h) *(012 est.; moved from D13-B4, originally D8-B3)* **Scraper** `tools/scraper/` (not in the app image; respects `robots.txt`, rate-limited): two real Montenegrin sources, ≈ 40 products each, third supplier generated — **time-box 4h in total** (3h here + 1h on D13-A3), otherwise the generated seed stays. Scraped data replaces the generated seed **before G3** (production seed on D14-A2). Output in **`.seed-private/`** (git- and docker-ignored, copied to the server by hand, backed up); the seed uses it if present, otherwise the generated seed (D8-A3). **Fictional supplier names on production** unless the mentors confirm consent. Scraped data, images and real names are never committed.
- *A ≈ 8.5h, B ≈ 8.5h.*

### D12 · Fri 04.12 — Sub-order lifecycle, seeded orders
- [ ] **D12-B1** (B · 4.5h) *(012 est.)* Sub-order state machine (`transition()`), events, cancellation with reversal ledger entries (per mode), order status via `app.recompute_order()`; status e-mails. **Ship requires `paid` for platform sub-orders** (M2); buyer cancel refused while a payment is `pending`; cancelling a paid platform sub-order before shipping triggers the refund; **supplier-API rejection cancels via `app.system_cancel_sub_order`** (expiry uses the same function on D15-B0).
- [ ] **D12-B2** (B · 1.5h) State machine + cancellation tests (a cancelled sub-order's entries sum to 0).
- [ ] **D12-B3** (B · 2h) Seed **8–10 orders in several states and in both modes** (direct under seeded contracts, platform paid / unpaid) through `createOrder` and `transition` as real actors (so supplier and admin screens are not empty).
- [ ] **D12-A1** (A · 3.5h) Sub-order detail: legal-transition buttons, StepperTimeline, status-change e-mail template; buyer order timeline.
- [ ] **D12-A2** (A · 2h) Admin all-orders list with filters.
- [ ] **D12-A3** (A · 2.5h) **Contract UI, part 2** (moved from D10-A2 — G2 needs only request + accept, D9-A3): buyer "My contracts" (status, end); supplier contract list.
- *A ≈ 8h, B ≈ 8h.*

### D13 · Sat 05.12 — Pro-forma PDF, admin · DoD on staging
- [ ] **D13-B1** (B · 3.5h) Invoice render job **for the platform part only** (orders without a platform part get none) (Playwright in the worker, from `content_snapshot`, stored in S3 as `invoices/<order id>.pdf`, idempotent); download route handler (buyer + platform only) that **re-enqueues the job when the file is missing**; invoice link in the order e-mail and order detail.
- [ ] **D13-B2** (B · 1h) Tests: re-run job is a no-op, supplier cannot download (404).
- [ ] **D13-B3** (B · 1.5h) E2E Definition-of-Done suite (incl. supplier B → supplier A's URL → not found).
- [ ] **D13-A3** (A · 1h) Scraper finish (last hour of the 4h time-box): switch the seed to `.seed-private/`, run it locally, copy the data to the server by hand for the D14 production seed.
- [ ] **D13-A1** (A · 3h) Invoice HTML template (A4, print CSS, repeated headers, page X of Y, embedded fonts).
- [ ] **D13-A2** (A · 2.5h) Admin overview; **"Record commission payment"** panel (direct mode) on the supplier ledger; payments shown read-only on the admin order detail.
- [ ] **D13-AB1** (A+B · 1h) **Definition of Done on staging** (incl. one successful card payment with its pro-forma); fix blockers.
- *A ≈ 7.5h, B ≈ 7h.*

### D14 · Sun 06.12 — Production · **G3**
- [ ] **D14-B1** (B · 3h) Full authorization matrix tests incl. IDOR with real foreign IDs (every action × org type × role × own / foreign).
- [ ] **D14-B2** (B · 1h) Rate limits: Better Auth defaults + one custom sign-in rule; one active CSV import per supplier (already a DB rule). Production seed with env passwords.
- [ ] **D14-B3** (B · 1.5h) **Diagrams for decision 012** in `docs/diagrams/`: sitemap without approval queue / pending banner (with contracts, gateway pages, admin "Create supplier"); ERD with `supplier_agreements`, `payments`, `payment_events`, `product_stock`, `sub_orders.mode`, `sub_orders.supplier_submission`; regenerate the PNGs (and the sitemap SVG); update `docs/diagrams/README.md`.
- [ ] **D14-A3** (A · 1.5h) Admin category management (tree: add / rename / deactivate — attribute definitions come from the seed) — moved from D6-A1.
- [ ] **D14-A1** (A · 2h) Security headers; accessibility pass (keyboard, contrast, axe); "works on a phone" check.
- [ ] **D14-A2** (A · 1h) Production deploy + seed; `REGISTRATION_OPEN=false` and **fictional supplier names** on production unless the mentors confirm consent (012 §9).
- [ ] **D14-AB1** (A+B · 2h) **G3** run-through on production; **first demo rehearsal** (MVP script) + backup screen recording; laptop fallback (full stack with seed via Docker Compose) tested once.
- [ ] **D14-AB2** (A+B · 0.3h) Weekly Progress Report (if the check-in is this week).
- *A ≈ 6.8h, B ≈ 7.8h.*

## Week 3 — gateway completion, stretch, freeze, demo

### D15 · Mon 07.12 — Gateway completion: failure scenes
- [ ] **D15-B0** (B · 1.5h) *(012 est.; moved from D11-B2)* **Payment expiry:** an unpaid platform part expires after 30 min; the job first asks the gateway (`GET /payments/{id}`) so a late callback cannot lose a paid order, then cancels via `app.system_cancel_sub_order`.
- [ ] **D15-B1** (B · 4.5h) *(012 est.)* Integration tests moved from D11-B3 — **duplicate event → no-op**, **forged signature → rejected** — then E2E failure scenes in the full suite: **declined card**, **forged callback rejected**, **replayed callback ignored** (gateway admin "replay last callback"), **payment expiry** (status query before cancelling), **supplier API down** blocks only that supplier group.
- [ ] **D15-B2** (B · 2.5h) *(012 est.)* Fixes from those scenes and from the G3 rehearsal.
- [ ] **D15-A1** (A · 3h) Buffer: MVP bugs and UI polish found in the G3 rehearsal.
- [ ] **D15-A2** (A · 3h) *(012 est.)* Mock gateway after G3: **3-D Secure** step, **insufficient funds**, **processing error / timeout** test cards.
- *A ≈ 6h, B ≈ 8.5h.*

### D16 · Tue 08.12 — Gateway completion: other test cards · "Create supplier" (MVP)
- [ ] **D16-B0** (B · 2.5h) *(012 est.; moved from D5-B1 via D10-B4 — the seed creates suppliers until then; G2 and G3 do not need this screen)* **MVP — must be finished on D16, before the G4 freeze.** Domain: admin **"Create supplier"** — organization + profile (`approved`) + owner user through a Better Auth server API **that does not start a session** (test: the admin stays logged in as the admin); set-password link with a longer lifetime, sent to Mailpit **and shown once to the admin**; company profile updates (+ audit entries).
- [ ] **D16-A0** (A · 1h) **MVP — must be finished on D16, before the G4 freeze.** Admin **"Create supplier"** form (shows the set-password link once) + supplier list — moved from D5-A3, with D16-B0.
- [ ] **D16-B1** (B · 3h) *(012 est.)* Payment handling + tests for the new outcomes (3-D Secure return, insufficient funds, processing error / timeout).
- [ ] **D16-B2** (B · 0.5h) *(012 est.)* Buffer: spill-over from week 2 (the rest of the buffer went to D16-B0).
- [ ] **D16-A1** (A · 3h) *(012 est.)* Return / status page and checkout UI for those outcomes.
- [ ] **D16-A2** (A · 2h) *(012 est.)* Design pass against the D4-A0 direction (spill-over from week 2 first).
- *A ≈ 6h, B ≈ 6h.*

### D17 · Wed 09.12 — S3 AI normalisation
- [ ] **D17-B1** (B · 4h) S3: server-side Claude client (`AI_ENABLED`, off by default; key/model from env; rate limit + daily cost cap stored in one small usage table; no personal data; JSON validated with the generated attribute Zod schema; fallback); normalisation as a job.
- [ ] **D17-B2** (B · 1.5h) S3 tests: invalid JSON, off-schema values, prompt-injection text, timeout fallback (model mocked in CI — CI never calls the API).
- [ ] **D17-A1** (A · 3h) S3: AiSuggestion UI on the product form (per-field accept / edit / reject; never auto-saves).
- [ ] **D17-A2** (A · 2h) S3: evaluation set — 15 messy descriptions with expected attributes; accuracy in README.
- *A ≈ 5h, B ≈ 5.5h.*

### D18 · Thu 10.12 — S4 NL search
- [ ] **D18-B1** (B · 3h) S4: query → filter object (same Zod filter schema) → `searchProducts()`; falls back to plain search.
- [ ] **D18-A1** (A · 2h) S4: interpreted-filter chips ("Interpreted from your search", each removable).
- *A ≈ 2h, B ≈ 3h — the rest of the day is spill-over or the next stretch goal (S1) from "Only if time".*

### D19 · Fri 11.12 — Stretch finish · **G4 freeze (EOD)**
- [ ] **D19-B1** (B · 2h) E2E for finished stretch features.
- [ ] **D19-A1** (A · 3h) Stretch UI polish; production deploy.
- [ ] **D19-AB1** (A+B · 0.5h) **Feature freeze.** Unfinished stretch → Known limitations.
- *A ≈ 3.5h, B ≈ 2.5h.*

### Only if time (before G4) — in this order
- [ ] **S1-B1** (B · 4h) S1: price tiers + buyer-specific prices behind `PricingResolver` (precedence buyer > tier > base, validity window); snapshots store the applied price.
- [ ] **S1-B2** (B · 2h) S1 tests: precedence, visibility (buyer B never sees buyer A's price), cart total = order total.
- [ ] **S1-A1** (A · 3h) S1 UI: supplier tier & buyer-price editor; tier / your-price display in catalogue and cart.
- [ ] **S5-B1** (B · 3h) S5: RFQ migration + request and quote services (only invited suppliers see an RFQ).
- [ ] **S5-B2** (B · 2.5h) S5: accept quote → **`createOrder(source = rfq)`**; tests (accept twice, expired quote).
- [ ] **S5-A1** (A · 3.5h) S5: buyer RFQ create + list; supplier RFQ inbox + quote form.
- [ ] **S5-A2** (A · 2.5h) S5: buyer quote comparison + accept.
- [ ] **S2-A1** (A · 3h) Product compare: select up to 4, side-by-side attribute table; "also offered by another supplier" (same GTIN).
- [ ] **S7-B1** (B · 2h) Member invitations: Better Auth invitations through the e-mail pipeline, owner only.
- [ ] **S7-A1** (A · 2h) Members page + accept-invitation page.

### D20 · Sat 12.12 — Polish & docs
- [ ] **D20-A1** (A · 4h) UX pass on all screens (loading / empty / error states, 360 / 768 widths, accessibility fixes).
- [ ] **D20-B1** (B · 3h) Bug fixes from the pass; money regression run across all order sources.
- [ ] **D20-AB1** (A+B · 2h) Specification as-built, README (limitations, AI evaluation, cost), diagrams regenerated.
- [ ] **D20-AB2** (A+B · 2h) 10-minute presentation slides (problem, architecture, decisions, limitations, learnings).
- *A ≈ 8h, B ≈ 7h.*

### D21 · Sun 13.12 — Release & rehearsal
- [ ] **D21-AB1** (A+B · 1h) Reset demo data on production; cut **`v1.0.0`**.
- [ ] **D21-AB2** (A+B · 2h) Demo rehearsals with timer, incl. failure paths; backup screen recording.
- [ ] **D21-AB3** (A+B · 0.3h) Weekly Progress Report (if the check-in is this week).
- *A ≈ 3.3h, B ≈ 3.3h.*

---

## Final demo script (10 min) — MVP; stretch scenes added only once they ship
1. **Problem** (1 min): fragmented PDF catalogues, several intermediaries.
2. **Supplier** (1.5 min): admin created the supplier (no self-registration); CSV with bad rows → report → import; product appears in search with a **stock badge** from the supplier API. *(+ S3: AI suggests attributes for a messy description.)*
3. **Buyer — two modes** (3 min): typo search ("frizider") → filters → cart from 3 suppliers. Supplier A: **order directly under our contract**; suppliers B and C: **pay by card** → mock gateway (test banner) → **success** → pro-forma PDF for the platform part → e-mails in the Mailpit inbox. A second attempt with the **declined** test card. *(+ S4 natural-language search.)*
4. **Supplier / admin** (2 min): each supplier sees only its sub-order (mode, "paid?"); supplier B opens supplier A's URL → not found; admin sees commission per supplier — direct-mode commission owed by the supplier, platform payouts owed to it; records a commission payment.
5. **Failure paths** (2 min): **forged callback rejected**; **replayed callback ignored** (one receipt only); **supplier API down** → only that supplier group shows "availability unknown", the rest of the cart can be ordered; price changed during checkout → re-confirm.
6. **Engineering** (30 s): pipeline staging → approval → production → release tag; honest limitations.
