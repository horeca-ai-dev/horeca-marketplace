# DESIGN.md — HoReCa B2B Marketplace design system

Working name: **HoReCa Marketplace** (rename freely). Audience: busy hotel/restaurant buyers, supplier catalogue managers, platform admins. Tone: **professional, calm, efficient**. Data-dense where people work (tables), clear and friendly where people decide (catalogue, checkout).

> **Decision 012 (25.11):** the UI is in **Montenegrin (Latin)**; suppliers are created by the admin (no approval queue, no pending banner); the cart offers a **purchase mode per supplier group**; contracts, stock badges and a mock card gateway are MVP.

## Design direction *(written in task D4-A0, before the first screens)*
The mentors asked for a **responsive, distinctive** UI that is clearly better than a generic design (decision 012 §10). **Before any screen is built, D4-A0 writes the direction here** — typography, colour, layout rhythm, motion — and every screen applies it. Until then, the tokens, typography and motion below are a **baseline**, not the final look; D4-A0 may replace them (accessibility rules stay).

## Principles
1. **Clarity over decoration** — B2B users scan and compare. Few colours, strong hierarchy, real data in every mock.
2. **Trust in numbers** — prices always show currency; net vs VAT vs total is explicit; money is right-aligned and tabular.
3. **Status is never colour-only** — every badge has a text label.
4. **Every screen has four states** — loading, empty, error, populated.
5. **Always show who you are acting as** — the active organization is visible on every authenticated screen.
6. **Mobile-first for buyers**, desktop-first for supplier/admin (still usable on tablet).
7. **Accessible by default** — WCAG 2.1 AA.

## Stack
Tailwind CSS + shadcn/ui (Radix) + lucide-react icons · React Hook Form + Zod for forms · TanStack Table for data tables · React Email for e-mail templates. Tokens live in CSS variables / Tailwind config (below). No custom CSS unless a token cannot express it.

## How UI talks to the server (affects every screen)
- **Reads** happen in Server Components. **Filters, sorting and pagination live in URL search params** — every filtered catalogue or table view is a shareable link, and there is no client-side fetching layer.
- **Writes** go through Server Actions (next-safe-action). Every submit button shows a pending state (disabled + spinner) from the action status; results show as a toast or inline field errors (`fieldErrors` from the action).
- Errors shown to users come from the action's `message`; never show stack traces or internal IDs.

## Colour tokens
| Token | Hex | Use |
|---|---|---|
| `--primary` | `#2B579A` | Primary buttons, links, active nav |
| `--primary-hover` | `#234A82` | Hover/pressed |
| `--primary-soft` | `#DCE6F5` | Selected rows, subtle fills, table header tint |
| `--bg` | `#FFFFFF` | Page |
| `--surface` | `#F5F6F8` | Panels, sidebars, zebra rows |
| `--border` | `#D9DDE3` | Borders, dividers |
| `--text` | `#1F2937` | Body text |
| `--text-muted` | `#5B6472` | Secondary text (≥ 4.5:1) |
| `--success` | `#1E7A4C` / bg `#E3F4EA` | Delivered, approved, OK |
| `--warning` | `#8A5A00` / bg `#FFF1D6` | Pending, needs attention |
| `--danger` | `#B3261E` / bg `#FBE3E0` | Errors, cancelled, rejected |
| `--info` | `#2B579A` / bg `#DCE6F5` | Confirmed, informational |
| `--ai` | `#6B3FA0` / bg `#EEE6F8` | AI-suggested content (stretch; always labelled "AI suggestion") |

### Organization-type colours (header badge + org switcher)
| Org type | Colour | Label |
|---|---|---|
| Buyer | `#2B579A` | "Buyer · {company}" |
| Supplier | `#0F766E` | "Supplier · {company}" |
| Platform | `#374151` | "Platform admin" |
Always with text label and icon — colour only reinforces.

### Environment banner
Staging shows a thin full-width banner at the top: warning colours, text "STAGING — test data". The environment name comes from runtime config passed by a Server Component (never a `NEXT_PUBLIC_*` variable). Production shows nothing.

Dark mode: out of scope. Verify contrast ≥ 4.5:1 (3:1 for large text and UI borders).

### Status badges (text + colour + icon)
| Entity | Status → style |
|---|---|
| Supplier organization | approved → success · suspended → danger (outlined) *(created as approved by the admin — no pending / rejected flow)* |
| Product | draft → muted · active → success · archived → muted (outlined) |
| Sub-order | pending → warning · confirmed → info · shipped → violet `#5B3FA0` · delivered → success · cancelled → danger |
| Card payment | created/pending → warning · succeeded → success · failed/cancelled/expired → danger · partly / fully refunded → muted with amount |
| Contract | requested → warning · active → success · rejected → danger · ended → muted |
| Stock badge | in stock (qty) → success · out of stock → warning · availability unknown → muted (with "checked HH:MM") |
| Purchase mode | direct (under contract) → supplier colour · platform / card → info — always a text label (Montenegrin wording in the catalogue) |
| RFQ (stretch) | open → info · quoted → warning · accepted → success · closed → muted |
| Order payment status | unpaid → warning · paid → success · refund_due → danger · not_applicable → hidden (direct-only orders) |
*(Sub-order states confirmed by decision 11.)*

## Typography
- Family: **Inter** via `next/font` (self-hosted at build, **`latin-ext` subset** so **č ć š ž đ** render). Fallback: system-ui, Segoe UI, Arial. Tabular numbers for money (`font-variant-numeric: tabular-nums`).
- Scale (px / line-height): H1 28/36 semibold · H2 22/30 semibold · H3 18/26 semibold · body 16/24 · small 14/20 · caption 12/16. Tables use 14.
- Max prose line length ≈ 70 characters.

## Spacing, layout, shape
- 4-px grid; steps 4, 8, 12, 16, 24, 32, 48. Radius 6 px (inputs, buttons), 10 px (cards). Shadows only for popovers/modals.
- Breakpoints: `sm 360`, `md 768`, `lg 1024`, `xl 1280`. Container max 1200 px; catalogue grid 1 / 2 / 3 / 4 columns.
- **Header (all areas):** logo · search (buyers only — the catalogue is for buyers) · cart with count (buyer) · **org badge + org switcher** · account menu.
- **Org switcher:** lists the user's organizations with type badge; switching is an explicit action that redirects to that organization's dashboard (`/buyer`, `/supplier`, `/admin`). Hidden when the user has one organization.
- Supplier/admin: left sidebar (collapses to top menu < 1024).

## Components (build in this order; `components/ui` or `components/domain`)
| Component | Rules |
|---|---|
| Button | primary / secondary / ghost / destructive; min height 40 px (44 touch); pending state disables + spinner; one primary per view |
| Input, Select, Textarea | label above (never placeholder-only), help text, inline error with icon + text, `aria-describedby`; wired through React Hook Form + Zod |
| **OrgBadge / OrgSwitcher** | type colour + label + icon; current org always visible |
| **MoneyText** | formats `1.234,56 €`; right-aligned in tables; "net" / "VAT" / "total" labels when ambiguous; formatting only — never calculates |
| **StatusBadge** | from the table above; text always present |
| DataTable (TanStack Table) | sticky header, sortable columns, row actions at right, pagination, empty state, horizontal scroll on small screens, `scope` attributes; sort/page/filter state in the URL |
| **ProductCard** | image (4:3, lazy, `srcset` with the 3 WebP sizes), name (2 lines max), supplier, key attributes (≤ 3), price (net + "excl. VAT"), "Add to cart" |
| **FilterSidebar** | category tree, price range, supplier checkboxes, attribute filters generated from the category schema, facet counts; price filter uses the base net price (S1 buyer-specific prices are shown but not filterable); active filters as chips; "Reset"; bottom sheet on phones |
| SearchBox | typo-tolerant search (Meilisearch); suggestions optional; submitting writes `?q=` to the URL |
| QuantityStepper | respects minimum order quantity; shows unit; validation message |
| **CartSupplierGroup** | lines grouped per supplier with sub-total — mirrors the future sub-orders; **mode choice** per group: contract active → "Order directly under our contract" or "Pay by card"; no contract → "Pay by card" + "Request a contract"; contract requested → "Pay by card" (with the request's status); stock unknown → group blocked with a reason |
| **StockBadge** | from `product_stock`; text + icon; "availability unknown" when the supplier API is down; never a filter in the MVP |
| **ContractStatus** | status badge + the one next action for the viewer (request / accept / reject / end) |
| StepperTimeline | sub-order history (event, time, actor) |
| FileDropzone | CSV and images; shows limits; accessible fallback button; images upload through the app with progress |
| **ImportReport** | counts (total / valid / failed), error table (row, column, message), "Download error CSV", primary action "Import N valid rows"; import runs as a job → show progress/status |
| Toast / Alert | success, error, info; errors persist until dismissed |
| EmptyState | icon, one sentence, one action |
| **CompareTable** (stretch S2) | up to 4 products side by side; rows = attributes of the shared category, price, supplier; differences highlighted (not colour-only) |
| **GatewayTestBanner** (in `mock-services`) | fixed, full-width, danger colours: "TEST — do not enter a real card"; always visible on the hosted card page |
| **SetPasswordLinkOnce** (admin) | shows a new supplier's set-password link once with a copy button and a warning that it will not be shown again |
| **AiSuggestion** (stretch) | violet label "AI suggestion", per-field accept/edit/reject, never auto-saves |

## Screens
| Area | Screens |
|---|---|
| Public (only these — everything else requires login) | Login, Register (**buyer company only** + company data in one form), Forgot/reset password, Set password (link from the admin, for new suppliers), "Complete company setup" (buyers; shown only if a user exists without an organization) |
| Buyer (`/buyer`) — the catalogue is for buyers only | Catalogue (with stock badges), Product detail (stock badge, "Request a contract" with this supplier), Cart (mode choice per supplier group), Checkout (location + mode per group + summary → gateway for the card part), Payment return / status ("Pay now" if the payment could not start), My orders, Order detail (mode + payment status per sub-order; pro-forma PDF for the platform part), **My contracts**, Company profile & delivery locations |
| Supplier (`/supplier`) | Dashboard, My products (list / edit with attribute form; stock comes from our API, not editable here), CSV import (+ report), Sub-orders (list / detail with actions, mode, "order paid?" status, supplier-API submission status; **no pro-forma download** — it lists other suppliers' lines), **Contract requests** (inbox: accept / reject) + contracts list, Ledger (balance + entries; direct-mode commission owed), Company profile & bank details (owner) |
| Admin (`/admin`) | Overview, Suppliers (list + **"Create supplier"** → set-password link shown once), Categories (tree: add / rename / deactivate — attribute definitions come from the seed), Commission & ledgers (+ **record supplier payout / adjustment**, **record commission payment** for direct mode), All orders (payments read-only; sub-orders whose supplier submission failed are flagged) |
| Mock gateway (`/gateway/`, `mock-services`) | Hosted card page with the **test banner** (test cards: success, declined; after G3: 3-D Secure, insufficient funds, error / timeout); gateway admin page behind basic auth ("replay last callback") |
| Stretch (order in `TASKS.md`: S3 → S4 → S1 → S5) | AI suggestion UI, NL-search chips, price tiers & buyer prices, RFQ screens; only if time: Product compare, Members & invitations |
| After the project (not scheduled) | Audit-log viewer, Jobs page, attribute-definition editor, supplier suspend / reinstate screens |

**The catalogue and all prices are visible only after login (B2B).** Which org types may browse it is defined in the permission matrix.

### Key layouts
- **Catalogue:** search + sort on top; filter sidebar left (≥ 1024) or sheet; grid right; result count; pagination; facet counts next to filter values. All state in the URL.
- **Cart/Checkout:** left = supplier groups with lines, each with its **mode choice** and stock state; right = sticky summary (net, VAT, total — and how much is paid **by card now** vs **directly under contracts**), delivery location select. Primary button: "Place order (N sub-orders)"; with a card part it continues to the gateway. A group whose supplier API is down shows "availability unknown" and is excluded; the rest can be ordered. If checkout reports changed prices/availability, show the changed lines and ask to re-confirm.
- **Payment return / status:** succeeded → order confirmation; declined / failed → reason + "Pay again"; pending → status that refreshes; the unpaid card part expires after 30 minutes (say so).
- **Supplier sub-order detail:** header with status badge + only the legal transition buttons; items table; buyer/delivery info; history timeline.
- **Admin commission:** KPI tiles (orders 30 d, GMV net, commission earned, commission owed by direct-mode suppliers) + table (supplier, sales, rate, commission, owed) + default-rate form. Definitions (money-rules §4): commission per supplier = Σ commission of non-cancelled sub-orders (both modes); a supplier balance may be negative (direct-mode commission owed); "commission earned" = the same sum (no delivered-only split in the MVP); all figures come from the ledger.

## Documents and e-mails
- **Pro-forma invoice PDF:** an HTML template rendered by Playwright in the worker. A4 portrait, print CSS (`@page` margins), table header repeated on every page, "Page X of Y" in the footer, fonts embedded (Inter `latin-ext`), money tabular and right-aligned. **One pro-forma for the platform part of an order, issued by the platform** — created once at checkout, only for the **platform (card) sub-orders**; orders without a platform part get none (platform IBAN, suppliers as sections with their legal data and VAT summary, VAT summary per rate 21 / 15 / 7 / 0 %), marked "PRO-FORMA — not a fiscal invoice" in Montenegrin. Simple layout, editable later (M4). Generated **once** and stored — never regenerated; "paid" is shown on the order page. After a cancellation the PDF keeps the original total; the order page shows the amount due.
- **E-mails (React Email):** plain, single-column, max width 600 px, logo, one primary action button, plain-text alternative. Templates (Montenegrin): order confirmation (buyer), new sub-order (supplier), status change, payment succeeded / failed / expired, sub-order rejected by the supplier API (+ refund), contract request (supplier) and decision (buyer), set password (new supplier), password reset; invitation (S7, only if time). All e-mails land in the Mailpit inbox in every environment.

## Content and copy
- Language: **Montenegrin (Latin)** for the UI, e-mails, invoice PDF, validation and domain error messages and CSV reports — all strings in `next-intl` message catalogues, none hard-coded. Code, logs and docs in English; an English UI only if time allows. *English labels in this document are descriptions; the real strings live in the catalogue.*
- Currency EUR `1.234,56 €`; dates `DD.MM.YYYY`; times 24 h; decimal comma in UI, dot in data.
- Button labels are verbs ("Place order", "Import 112 valid rows"). Error messages say what happened and what to do ("Row 14: price must be a positive number").
- Never blame the user; never show internal IDs or stack traces.

## Accessibility checklist (per screen)
Keyboard reachable in logical order · visible focus ring (2 px `--primary`, offset 2) · labels for every control · headings in order · images have alt text · status not colour-only · touch targets ≥ 44 px · forms announce errors (`aria-live="polite"`) · tables have headers · contrast ≥ 4.5:1 · no content only on hover. Run axe/Lighthouse before each gate.

## Motion
150 ms ease-out for hover/open; respect `prefers-reduced-motion`. No auto-playing animations.

## Images and icons
Product images: JPEG/PNG/WebP up to 5 MB on upload; the worker creates **3 WebP sizes (320 / 640 / 1280 px wide)**; pages use `srcset` + `sizes` so the browser picks the smallest that fits; shown 4:3 with `object-fit: cover`; placeholder when missing or still processing. Icons: lucide, 16/20/24 px, decorative icons `aria-hidden`.

## Do / Don't
- ✔ One primary action per view · real seed data in screenshots · consistent money formatting · active organization always visible.
- ✘ Colour-only status · placeholder-only labels · custom CSS for one-off tweaks · modals for long forms · decorative gradients · `NEXT_PUBLIC_*` config in components.

## Folder structure (UI)
```
src/components/ui/        # shadcn primitives (Button, Input, Table…)
src/components/domain/    # ProductCard, FilterSidebar, MoneyText, StatusBadge, OrgSwitcher, ImportReport…
src/app/(public)/         # auth pages only
src/app/buyer/  src/app/supplier/  src/app/admin/   # guarded by org type
src/server/email/templates/   # React Email
src/lib/format.ts         # money/date formatting (display only)
```
