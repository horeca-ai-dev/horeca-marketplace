# DESIGN.md — HoReCa B2B Marketplace design system

Working name: **HoReCa Marketplace** (rename freely). Audience: busy hotel/restaurant buyers, supplier catalogue managers, platform admins. Tone: **professional, calm, efficient** — a B2B work tool, not a marketing site.

> **Decision 012 (25.11):** the UI is in **Montenegrin (Latin)**; suppliers are created by the admin (no approval queue, no pending banner); the cart offers a **purchase mode per supplier group**; contracts, stock badges and a mock card gateway are MVP.

## Design direction *(D4-A0 — every screen follows it)*
Buyers do two jobs. When **shopping** they look and pick: images lead and the interface stays out of the way. When handling **orders, contracts and invoices** they read and decide: clarity leads and decoration disappears. Both modes share the same green, typeface and components, so it is one product — smooth, intuitive, a clean and predictable place for everything.

The rules below are written to be **checked**: a reviewer can answer each with yes or no. Live specimen: **`/dev/style`** (local and staging; 404 in production). Tokens: `src/app/globals.css`. Contrast: `src/lib/design/contrast.test.ts`.

## Principles
1. **Two modes, one product.** Shopping mode (catalogue, product, cart drawer): the image is the largest thing on screen. Operations mode (orders, contracts, invoices, ledger, every supplier and admin screen): text and numbers are, and there is no imagery or decoration at all.
2. **One green.** `--primary` is the only brand colour. A view contains **at most one solid green button**. No second accent colour.
3. **A badge never looks clickable.** Solid fills are for buttons only; statuses are a soft tint with a dot and a text label.
4. **Status is never colour-only** — every badge has a text label; stock and status are readable in greyscale.
5. **Trust in numbers** — prices always show the currency; net / VAT / total is explicit; amounts that stack in a column are right-aligned in tabular figures.
6. **Every screen has four states** — loading (skeleton), empty (with the next step), error, populated.
7. **Always show who you are acting as** — the active organization is visible on every authenticated screen.
8. **Labels say what the thing does.** No marketing filler, no decoration that carries no information.
9. **Mobile-first for buyers**, desktop-first for supplier / admin (still usable on a tablet).
10. **Accessible by default** — WCAG 2.1 AA, full keyboard use.

## Stack
Tailwind CSS + shadcn/ui (Radix) + lucide-react icons · React Hook Form + Zod for forms · TanStack Table for data tables · React Email for e-mail templates. Tokens live in `src/app/globals.css` (CSS variables + the Tailwind v4 `@theme`); Tailwind's default palette, shadows and font sizes are switched off there, so only the tokens below exist. No custom CSS unless a token cannot express it.

## How UI talks to the server (affects every screen)
- **Reads** happen in Server Components. **Filters, sorting and pagination live in URL search params** — every filtered catalogue or table view is a shareable link, and there is no client-side fetching layer.
- **Writes** go through Server Actions (next-safe-action). Every submit button shows a pending state (disabled + spinner) from the action status; results show as a toast or inline field errors (`fieldErrors` from the action).
- Errors shown to users come from the action's `message`; never show stack traces or internal IDs.

## Colour tokens
Names follow shadcn/ui where it has one. Components use the Tailwind utilities (`bg-surface`, `text-muted-foreground`, `border-input` …) — **never a raw hex value outside `globals.css`**.

| Token | Hex | Use |
|---|---|---|
| `--background` | `#FFFFFF` | Page, cards, inputs |
| `--surface` | `#F4F7F5` | Panels, sidebars, table header, row hover |
| `--well` | `#EAEFEC` | The neutral square behind every product photo |
| `--selected` | `#EEF5F1` | Selected table row, selected radio option |
| `--border` | `#D3DBD6` | 1 px separators (decorative) |
| `--input` | `#7C8A82` | Borders of controls (inputs, secondary buttons, radios) |
| `--foreground` | `#16201B` | Text, headings |
| `--muted-foreground` | `#55625B` | Secondary text |
| `--primary` | `#1F6B4A` | The primary button, links, active nav, focus ring (`--ring`) |
| `--primary-hover` | `#18573C` | Primary button hover / pressed |
| `--primary-foreground` | `#FFFFFF` | Label on a solid fill |
| `--destructive` / `-hover` | `#B3261E` / `#951F18` | Destructive button only |
| `--positive-bg` / `-text` | `#E2F1E9` / `#17593D` | Badge tone: positive |
| `--attention-bg` / `-text` | `#FBEFD3` / `#734C00` | Badge tone: attention; staging banner |
| `--negative-bg` / `-text` | `#FBE5E2` / `#9E241C` | Badge tone: negative; `-text` is also error text |
| `--neutral-bg` / `-text` | `#EAEFEC` / `#3F4B45` | Badge tone: neutral |
| `--progress-bg` / `-text` | `#E3ECF1` / `#2F4F63` | Badge tone: in progress (desaturated slate — **badges only**) |

**Green has two jobs** — brand, and "success / in stock". They never look alike: solid `--primary` = a button; soft `--positive-bg` with a dot and a label = a status.

### Contrast (WCAG 2.x, computed — the test fails if a pair drops below its minimum)
Only these pairs are allowed. Text minimum **4.5:1** (also for large text); control borders and the focus ring **3:1**.

| Foreground on background | Ratio | Use |
|---|---|---|
| `foreground` on `background` / `surface` / `well` / `selected` | 16.71 / 15.49 / 14.37 / 15.09 | Text |
| `muted-foreground` on `background` / `surface` / `well` / `selected` | 6.39 / 5.93 / 5.50 / 5.77 | Secondary text |
| `primary` on `background` / `surface` / `selected` | 6.44 / 5.97 / 5.82 | Links; focus ring (needs 3) |
| `primary-foreground` on `primary` / `primary-hover` | 6.44 / 8.51 | Primary button label |
| `primary-foreground` on `destructive` / `destructive-hover` | 6.54 / 8.44 | Destructive button label |
| `negative-text` on `background` | 7.71 | Error text under a field |
| `positive-text` on `positive-bg` | 7.10 | Badge |
| `attention-text` on `attention-bg` | 6.66 | Badge, staging banner |
| `negative-text` on `negative-bg` | 6.39 | Badge |
| `neutral-text` on `neutral-bg` | 7.84 | Badge |
| `progress-text` on `progress-bg` | 7.25 | Badge |
| `input` on `background` / `surface` | 3.61 / 3.35 | Control borders (needs 3) |

`--border` on white is 1.41:1 — it only separates; nothing depends on seeing it. Disabled controls are 50 % opacity and exempt (WCAG), so a disabled control always has a text reason next to it. A new pair is added to `CONTRAST_PAIRS` (`src/lib/design/contrast.ts`) before it is used.

**No organization-type colours, no violet, no AI purple.** Organization type is shown by label + icon ("Kupac · {firma}", "Dobavljač · {firma}", "Administrator platforme"); AI suggestions (stretch) use the neutral tone with the label "AI prijedlog". Dark mode: out of scope.

### Environment banner
Staging shows a thin full-width banner at the top in the attention tone: "STAGING — testni podaci". The environment name comes from runtime config passed by a Server Component (never a `NEXT_PUBLIC_*` variable). Production shows nothing.

## Typography
- **One grotesque sans family for everything: Schibsted Grotesk** (SIL Open Font License) — UI, tables, e-mails, invoice PDF. Chosen on 26.11.2026 on `/dev/style` over Hanken Grotesk.
- **Verified against the font files (26.11.2026):** contains **č ć š ž đ / Č Ć Š Ž Đ** (`latin-ext`) and **€** (`latin`); weight axis 400–900. Its digits are **proportional by default**; the `tnum` feature (`tabular-nums`) makes them equal width (1300 / 2048 units at weights 400–700) — noticeably wider, which is why tabular figures are limited to columns (rule below).
- **Loading:** the font is **committed as local files** (variable woff2, `latin` + `latin-ext`, with its **OFL licence file**) under `src/app/fonts/` and loaded with **`next/font/local`** in the root layout (task D4-A1), exposed as `--font-app`. Builds never download fonts; the same files are embedded in the invoice PDF. (Until D4-A1, `/dev/style` alone loads it with `next/font/google`, next to the rejected candidate for comparison.) Fallback: system-ui, Segoe UI, Arial.
- **Scale — six steps, nothing else** (px size / line height):

  | Step | Size | Weight | Utility |
  |---|---|---|---|
  | H1 (one per page) | 28 / 36 | 600 | `text-2xl` |
  | H2 | 22 / 30 | 600 | `text-xl` |
  | H3 | 18 / 26 | 600 | `text-lg` |
  | Body | 16 / 24 | 400 | `text-base` |
  | Small — tables, help text | 14 / 20 | 400 | `text-sm` |
  | Caption | 12 / 16 | 400 | `text-xs` |
- **Three weights:** 400 regular, 500 medium (labels, table headers, badges), 600 semibold (headings, buttons, totals). No 700+.
- **Hierarchy from size and weight only.** Headings are upright, semibold, `--foreground`. No italics, no serif, no coloured or gradient headings, no uppercase letter-spaced labels, no letter-spacing changes at all.
- **Figures — two rules, no third case:**
  - **Tabular (`tabular-nums`) only where values stack in a column:** amount, quantity, date and number columns of tables (orders, sub-orders, ledger, import report), cart and checkout line amounts and totals, the invoice. These amounts are right-aligned.
  - **Proportional (the font's default) everywhere else:** catalogue tiles, the product page price, prices and numbers inside a sentence, badges, headings, the quantity stepper, the ledger balance sentence.
  - `MoneyText` is proportional by default and takes a `tabular` prop; `DataTable` amount columns and the cart / checkout summary set it. Nobody writes `tabular-nums` by hand outside those components.
- Max prose line length ≈ 70 characters.

## Spacing, shape, borders, shadows, motion
- **Spacing:** 4-px grid; steps 4, 8, 12, 16, 24, 32, 48. Sections of a page are 32 px apart; fields in a form 16 px; inside a tile or card 12–16 px.
- **Radius: 6 px everywhere** (buttons, inputs, tiles, panels, badges, dialogs). The only exception is a full circle (badge dot, radio, spinner, avatar).
- **Separation by 1 px `--border` and spacing**, not by boxes: a section does not sit in a card unless it is a repeated item (tile, supplier group, radio option).
- **Shadow: one (`shadow-float`), only on floating layers** — cart drawer, side panel, dialogs, menus, popovers, toasts. Nothing in the page flow has a shadow.
- **Control height 40 px** (44 px on touch devices, set by `--control-h`); table rows 56 px (buyer) / 40 px (supplier, admin).
- **Motion:** 120 ms (`--motion-fast`: hover, focus, colour) and 200 ms (`--motion-base`: drawer, sheet, panel, dialog), ease-out. **Nothing is slower than 200 ms**; nothing moves on hover (no lift, no scale); nothing animates by itself except a loading spinner. `prefers-reduced-motion: reduce` switches all transitions and animations off (global rule in `globals.css`).
- **Skeletons** have the exact size of the content they replace (same row height, same image square) — no layout shift when data arrives.
- **Focus:** 2 px `--ring` outline, 2 px offset, on every focusable element, keyboard focus only (`:focus-visible`). Never removed.

## Layout
- Breakpoints: `sm 360`, `md 768`, `lg 1024`, `xl 1280`. Container max 1200 px, side padding 16 px (32 px from `md`).
- **Header (all areas):** logo · search (buyers only — the catalogue is for buyers) · cart with count (buyer) · **org badge + org switcher** · account menu.
- **Org switcher:** lists the user's organizations with their type label; switching is an explicit action that redirects to that organization's dashboard (`/buyer`, `/supplier`, `/admin`). Hidden when the user has one organization.
- Supplier / admin: left sidebar (collapses to a top menu below 1024).

### Shopping mode (buyer: catalogue, product page, cart drawer)
- **Catalogue:** a grid of image tiles, **2 / 3 / 4 columns** at `sm` / `md` / `xl` (1 column below 360). All state (query, filters, sort, page) in the URL.
- **Tile** (`ProductCard`): a **square** image on `--well` (photo `object-fit: contain`, so uneven supplier images look uniform) · name (max 2 lines) · supplier · stock badge · price with "bez PDV-a" (proportional figures) · **add button**. The add button is **secondary** (a grid holds many — the solid green button is reserved) and **turns into a quantity stepper** once tapped; at quantity 0 it turns back. Out of stock / availability unknown → the button is disabled and the badge says why.
- **Filters:** a left rail from `lg`; below it a **bottom sheet** opened by a "Filteri" button. **Active filters are removable chips above the grid**, with "Poništite sve". Facet counts next to values.
- **Product page:** gallery on the left half; **price (proportional figures), stock, quantity and the add button pinned on the right** (sticky while the left side scrolls); attributes below as a **two-column specification list** (label left, value right, 1 px rows). On mobile: gallery, then the buy block, then the specification; the add button stays in a bar fixed to the bottom.
- **Cart drawer:** adding an item slides in a drawer from the right (200 ms), **already grouped by supplier** with each group's sub-total, so the buyer keeps browsing. It is the one place in shopping mode with a solid green button ("Pregledajte korpu"). Full-screen on mobile.

### Operations mode (orders, contracts, invoices, ledger; all supplier and admin screens)
- **Tables** (`DataTable`): row height **56 px for buyers, 40 px for supplier / admin**; **5–6 visible columns by default** (admin may show more; everything else lives in the side panel); **amounts right-aligned in tabular figures**; header on `--surface`, 14 px medium; rows separated by 1 px, hover `--surface`; no zebra stripes. The scroll wrapper is `position: relative`.
- **Row → side panel:** clicking a row (or Enter on it) opens the detail in a panel on the right (≈ 480 px, floating shadow), the selected row gets `--selected`, **the list stays in view**. Esc closes it and returns focus to the row. The panel's state is in the URL.
- **One visible action per row** (a text button), the rest in a "⋯" menu with an accessible name.
- **Purchase mode per supplier group** (`CartSupplierGroup`): **radio options that state the consequence in plain words** — title + one sentence saying what happens to the money. If direct is unavailable the option stays visible, disabled, **says why**, and offers **"Zatražite ugovor"** in the same place; while a request is pending it shows the request's status instead.
- **Checkout summary:** the total is **split into "Naplaćujemo sa Vaše kartice sada" and "Fakturišu Vam dobavljači"**, each with its amount, above the grand total; the amounts form one right-aligned tabular column. The one solid green button: "Potvrdite porudžbinu".
- **Invoice:** a **paper-like preview** (white sheet with a 1 px border on `--surface`, A4 proportions) and **one download button**.
- **Ledger:** the balance is stated **in words** — "Platforma Vam duguje 1.234,56 €" / "Dugujete platformi 1.234,56 €" (admin view: "Platforma duguje dobavljaču" / "Dobavljač duguje platformi"), never only + / −. Entry rows have a type label and a signed, right-aligned amount.
- **Empty states:** every table has a designed empty state — one sentence saying what will appear here and **one action that is the next step** (e.g. no orders → "Otvorite katalog").

### Mobile (below `md`)
The side panel becomes a **full-screen sheet**; tables collapse to **stacked rows** (first column as the title, status badge and amount on the second line, the row action below); the cart drawer and the filter sheet go **full-screen** / bottom sheet. No horizontal page scroll at 360 px.

### Key layouts
- **Cart / Checkout:** left = supplier groups with lines, each with its **mode choice** and stock state; right = sticky summary (net, VAT, total, and the card / supplier-invoice split), delivery location select. A group whose supplier API is down shows "Dostupnost nepoznata" and is excluded; the rest can be ordered. If checkout reports changed prices / availability, show the changed lines and ask to re-confirm.
- **Payment return / status:** succeeded → order confirmation; declined / failed → reason + "Platite ponovo"; pending → a status that refreshes; the unpaid card part expires after 30 minutes (say so).
- **Supplier sub-order detail** (side panel): status badge + only the legal transition buttons; items table; buyer / delivery info; history timeline.
- **Admin commission:** four figures in a plain row separated by 1 px borders (orders 30 d, GMV net, commission earned, commission owed by direct-mode suppliers) + table (supplier, sales, rate, commission, owed) + default-rate form. Definitions (money-rules §4): commission per supplier = Σ commission of non-cancelled sub-orders (both modes); a supplier balance may be negative (direct-mode commission owed); "commission earned" = the same sum (no delivered-only split in the MVP); all figures come from the ledger.

## Badges — one set for buyer, supplier and admin
**Anatomy:** 24 px high, 6 px radius, tone tint, 6 px dot, 12 px medium label; no border, no icon, no hover, never a link. The label is short (≤ 24 characters); extra facts (a time, an amount of detail) go in a caption next to it. Five tones only: **positive · attention · negative · neutral · progress**.

| Entity | Status → tone · label |
|---|---|
| Sub-order | pending → attention · „Na čekanju" · confirmed → progress · „Potvrđeno" · shipped → progress · „Poslato" · delivered → positive · „Isporučeno" · cancelled → negative · „Otkazano" |
| Stock | in stock → positive · „Na stanju · 24 kom" · out of stock → attention · „Nema na stanju" · unknown → neutral · „Dostupnost nepoznata" (+ caption „Provjereno u 14:32") |
| Card payment | created / pending → attention · „Čeka uplatu" · succeeded → positive · „Plaćeno" · failed → negative · „Odbijeno" · cancelled → negative · „Prekinuto" · expired → negative · „Isteklo" · refunded (partly / fully) → neutral · „Vraćeno 120,00 €" |
| Order payment status | unpaid → attention · „Nije plaćeno" · paid → positive · „Plaćeno" · refund_due → attention · „Povraćaj u toku" · not_applicable → hidden (direct-only orders) |
| Contract | requested → attention · „Zatražen" · active → positive · „Aktivan" · rejected → negative · „Odbijen" · ended → neutral · „Okončan" |
| Purchase mode | direct → neutral · „Direktno" · platform → neutral · „Kartica" |
| Supplier submission | pending → neutral · „Slanje u toku" · accepted → positive · „Prihvaćeno" · rejected → negative · „Odbijeno" · failed → negative · „Slanje nije uspjelo" |
| Product | draft → neutral · „Nacrt" · active → positive · „Aktivan" · archived → neutral · „Arhiviran" |
| Supplier organization | approved → positive · „Aktivan" · suspended → negative · „Suspendovan" *(created as approved by the admin — no pending / rejected flow)* |
| RFQ (stretch) | open → progress · quoted → attention · accepted → positive · closed → neutral |

*(Sub-order states confirmed by decision 11. Labels are the starting wording; the catalogue in `messages/` is authoritative once it exists.)*

## Components (`components/ui` or `components/domain`; built from D4-A1 / D4-A2)
| Component | Rules |
|---|---|
| Button | **primary** (solid green — at most one per view) / **secondary** (white, `--input` border) / **ghost** (green text, no border) / **destructive** (solid red, only inside a confirmation); 40 px (44 touch), 14 px semibold; pending state disables + spinner + a changed label ("Šaljemo…"); hover changes colour only |
| Input, Select, Textarea | label above (never placeholder-only), `--input` border, help text, inline error with icon + text in `--negative-text`, `aria-describedby`; wired through React Hook Form + Zod |
| **OrgBadge / OrgSwitcher** | type label + icon + company name, no type colour; current org always visible |
| **MoneyText** | formats `1.234,56 €`; proportional figures by default, `tabular` prop (tabular figures, right-aligned) for amount columns and totals; "neto" / "PDV" / "ukupno" labels when ambiguous; formatting only — never calculates |
| **StatusBadge** | from the badge table; one component for every status in every area |
| DataTable (TanStack Table) | densities `comfortable` / `compact`; sticky header; sortable columns; row click → side panel; one visible action + menu; pagination; designed empty state; skeleton rows of the same height; stacked rows on mobile; `scope` attributes; sort / page / filter / open row in the URL |
| **SidePanel** | detail of the selected row; floating; Esc closes, focus returns; full-screen sheet on mobile |
| **ProductCard** | the tile above: square image on `--well` (lazy, `srcset` with the 3 WebP sizes), name (2 lines max), supplier, StockBadge, price (net + "bez PDV-a"), add button → QuantityStepper |
| **FilterRail / FilterSheet** | category tree, price range, supplier checkboxes, attribute filters generated from the category schema, facet counts; price filter uses the base net price (S1 buyer-specific prices are shown but not filterable); active filters as removable chips above the grid; "Poništite sve" |
| SearchBox | typo-tolerant search (Meilisearch); suggestions optional; submitting writes `?q=` to the URL |
| QuantityStepper | − / quantity + unit / +; respects the minimum order quantity; buttons have accessible names; validation message |
| **CartDrawer** | slides in on add; lines grouped by supplier with sub-totals; full-screen on mobile |
| **CartSupplierGroup** | lines per supplier with sub-total — mirrors the future sub-orders; **mode radio options** (above): contract active → direct or card; no contract → card + "Zatražite ugovor"; contract requested → card (with the request's status); stock unknown → group blocked with a reason |
| **StockBadge** | from `product_stock`; StatusBadge + optional "Provjereno u HH:MM" caption; never a filter in the MVP |
| **ContractStatus** | status badge + the one next action for the viewer (request / accept / reject / end) |
| **InvoicePreview** | paper-like sheet + one download button |
| **LedgerBalance** | the balance sentence in words + amount |
| StepperTimeline | sub-order history (event, time, actor) |
| FileDropzone | CSV and images; shows limits; accessible fallback button; images upload through the app with progress |
| **ImportReport** | counts (total / valid / failed), error table (row, column, message), "Preuzmite CSV sa greškama", primary action "Uvezite N ispravnih redova"; import runs as a job → show progress / status |
| Toast / Alert | success, error, info in the badge tones; errors persist until dismissed |
| EmptyState | one sentence, one action (the next step); no illustration |
| **CompareTable** (stretch S2) | up to 4 products side by side; rows = attributes of the shared category, price, supplier; differences marked with a label, not colour only |
| **GatewayTestBanner** (in `mock-services`) | fixed, full-width, negative tone: "TEST — ne unosite pravu karticu"; always visible on the hosted card page |
| **SetPasswordLinkOnce** (admin) | shows a new supplier's set-password link once with a copy button and a warning that it will not be shown again |
| **AiSuggestion** (stretch) | neutral badge "AI prijedlog", per-field accept / edit / reject, never auto-saves |

**Icons:** one outline set — **lucide**, stroke 1.5 px, sizes 16 / 20 / 24, colour inherited from the text; decorative icons `aria-hidden`. **Never emoji**, never a second icon set, never filled icons.

## States (every screen)
| State | Rule |
|---|---|
| Loading | skeleton with the final dimensions (table: rows of the table's height; grid: square tiles); no spinner for page content — spinners only inside a pending button |
| Empty | EmptyState: what will be here + the next step as one action |
| Error | what happened + what to do, from the action's `message`; a retry action where one exists; never a stack trace or an internal ID |
| Populated | real seed data in every screenshot and demo |
| Pending action | the button is disabled, shows a spinner and a changed label; the rest of the form stays readable |
| Disabled | 50 % opacity **and** a text reason next to the control |

## Screens
*Mode per area: buyer catalogue / product / cart drawer = **shopping mode**; everything else = **operations mode** (lists are a table + side panel unless stated).*

| Area | Screens |
|---|---|
| Public (only these — everything else requires login) | Login, Register (**buyer company only** + company data in one form), Forgot/reset password, Set password (link from the admin, for new suppliers), "Complete company setup" (buyers; shown only if a user exists without an organization) |
| Buyer (`/buyer`) — the catalogue is for buyers only | Catalogue (image-tile grid, filter rail / bottom sheet, active-filter chips, stock badges), Product detail (gallery left, pinned buy block right, two-column specification; stock badge, "Request a contract" with this supplier), Cart drawer (opens on add, grouped by supplier), Cart (mode radio options per supplier group), Checkout (location + mode per group + summary split into card now / invoiced by suppliers → gateway for the card part), Payment return / status ("Pay now" if the payment could not start), My orders (table, 56 px rows → side panel), Order detail (mode + payment status per sub-order; pro-forma as a paper-like preview with one download button, platform part only), **My contracts** (table → side panel), Company profile & delivery locations |
| Supplier (`/supplier`) | Dashboard, My products (compact table / edit with attribute form; stock comes from our API, not editable here), CSV import (+ report), Sub-orders (compact table → side panel with the legal actions, mode, "order paid?" status, supplier-API submission status; **no pro-forma download** — it lists other suppliers' lines), **Contract requests** (inbox: accept / reject) + contracts list, Ledger (balance stated in words + entries; direct-mode commission owed), Company profile & bank details (owner) |
| Admin (`/admin`) | Overview, Suppliers (compact table + **"Create supplier"** → set-password link shown once), Categories (tree: add / rename / deactivate — attribute definitions come from the seed), Commission & ledgers (+ **record supplier payout / adjustment**, **record commission payment** for direct mode), All orders (payments read-only; sub-orders whose supplier submission failed are flagged) |
| Mock gateway (`/gateway/`, `mock-services`) | Hosted card page with the **test banner** (test cards: success, declined; after G3: 3-D Secure, insufficient funds, error / timeout); gateway admin page behind basic auth ("replay last callback") |
| Stretch (order in `TASKS.md`: S3 → S4 → S1 → S5) | AI suggestion UI, NL-search chips, price tiers & buyer prices, RFQ screens; only if time: Product compare, Members & invitations |
| After the project (not scheduled) | Audit-log viewer, Jobs page, attribute-definition editor, supplier suspend / reinstate screens |

**The catalogue and all prices are visible only after login (B2B).** Which org types may browse it is defined in the permission matrix.

## Documents and e-mails
- **Pro-forma invoice PDF:** an HTML template rendered by Playwright in the worker. A4 portrait, print CSS (`@page` margins), table header repeated on every page, "Page X of Y" in the footer, fonts embedded (the UI typeface, same local files), money tabular and right-aligned. **One pro-forma for the platform part of an order, issued by the platform** — created once at checkout, only for the **platform (card) sub-orders**; orders without a platform part get none (platform IBAN, suppliers as sections with their legal data and VAT summary, VAT summary per rate 21 / 15 / 7 / 0 %), marked "PRO-FORMA — not a fiscal invoice" in Montenegrin. Simple layout, editable later (M4). Generated **once** and stored — never regenerated; "paid" is shown on the order page. After a cancellation the PDF keeps the original total; the order page shows the amount due.
- **E-mails (React Email):** plain, single-column, max width 600 px, logo, one primary action button (solid `--primary`), system font stack as fallback, plain-text alternative. Templates (Montenegrin): order confirmation (buyer), new sub-order (supplier), status change, payment succeeded / failed / expired, sub-order rejected by the supplier API (+ refund), contract request (supplier) and decision (buyer), set password (new supplier), password reset; invitation (S7, only if time). All e-mails land in the Mailpit inbox in every environment.

## Content and copy
- Language: **Montenegrin (Latin)** for the UI, e-mails, invoice PDF, validation and domain error messages and CSV reports — all strings in `next-intl` message catalogues, none hard-coded (the `/dev/style` specimen is the one exception). Code, logs and docs in English; an English UI only if time allows. *English text in this document describes; quoted „…" text is the wording.*
- **Formal "Vi"**, capitalised (Vi, Vas, Vam, Vaš). Ijekavian forms (provjereno, cijena, uspjelo).
- **Short labels that say what the thing does.** Buttons are verbs in the formal imperative: „Potvrdite porudžbinu", „Dodajte", „Zatražite ugovor", „Preuzmite PDF", „Uvezite 112 ispravnih redova". Navigation and headings are nouns: „Porudžbine", „Ugovori", „Fakture".
- **Money** `1.234,56 €` (dot for thousands, decimal comma, space, €) · **dates** `DD.MM.YYYY` (26.11.2026) · **times** 24 h `HH:MM` · decimal comma in the UI, dot in data.
- Fixed wording (use exactly this):

  | Where | Wording |
  |---|---|
  | Mode option: card | „Platite odmah karticom" — „{iznos} naplaćujemo sa Vaše kartice čim potvrdite porudžbinu." |
  | Mode option: direct | „Dobavljač Vam fakturiše direktno" — „Plaćate dobavljaču po uslovima Vašeg ugovora. Platforma Vam ne naplaćuje ništa." |
  | Direct unavailable | „Nije dostupno: za direktnu kupovinu potreban je aktivan ugovor sa dobavljačem." + „Zatražite ugovor" |
  | Checkout split | „Naplaćujemo sa Vaše kartice sada" · „Fakturišu Vam dobavljači" |
  | Ledger balance | „Platforma Vam duguje {iznos}" · „Dugujete platformi {iznos}" |
  | Price note | „bez PDV-a" |
  | Stock | „Na stanju · {n} {jedinica}" · „Nema na stanju" · „Dostupnost nepoznata" |
- Error messages say what happened and what to do („Red 14: cijena mora biti pozitivan broj"). Never blame the user; never show internal IDs or stack traces.

## Accessibility checklist (per screen)
Keyboard reachable in logical order · visible focus ring (2 px `--ring`, offset 2) · labels for every control · headings in order · images have alt text · status not colour-only · touch targets ≥ 44 px · forms announce errors (`aria-live="polite"`) · tables have headers · contrast ≥ 4.5:1 for all text (only the pairs in the contrast table) · no content only on hover. Run axe/Lighthouse before each gate.

## Images
Product images: JPEG / PNG / WebP up to 5 MB on upload; the worker creates **3 WebP sizes (320 / 640 / 1280 px wide)**; pages use `srcset` + `sizes` so the browser picks the smallest that fits. Shown in a **1:1 square on `--well`** with `object-fit: contain` (nothing is cropped; uneven photos look uniform); the same square with a neutral placeholder when the image is missing or still processing. No other imagery anywhere in the product: no illustrations, no stock photos, no decorative backgrounds.

## Do not use
These are the generic AI-design patterns this product avoids. A PR that contains one is not done.
- Italic or serif emphasis on words in headings; serif display headings.
- Cream or beige backgrounds; terracotta or orange accents.
- Inter as the default typeface.
- Gradients of any kind (including gradient text and purple-to-blue fills).
- Glass / blur, glows, soft shadows under every card.
- Everything in large-radius rounded cards; cards with a coloured left border stripe.
- Tiny uppercase letter-spaced labels above headings; pill badges above a title ("New", sparkles).
- A centred hero with a big headline and two buttons; three-column icon / title / blurb rows.
- Emoji as icons or bullets.
- Hover effects that lift or scale cards.
- More than one solid green button per view.
- Colour as the only signal for stock or status.
- Marketing filler copy — labels say what the thing does.

Also not allowed (project rules): placeholder-only labels · custom CSS for one-off tweaks · raw hex values or Tailwind default colours in components · modals for long forms · `NEXT_PUBLIC_*` config in components.

## Folder structure (UI)
```
src/components/ui/        # shadcn primitives (Button, Input, Table…)
src/components/domain/    # ProductCard, FilterSidebar, MoneyText, StatusBadge, OrgSwitcher, ImportReport…
src/app/(public)/         # auth pages only
src/app/buyer/  src/app/supplier/  src/app/admin/   # guarded by org type
src/server/email/templates/   # React Email
src/lib/format.ts         # money/date formatting (display only)
```
