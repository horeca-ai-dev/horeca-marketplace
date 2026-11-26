/**
 * /dev/style — preview of the design direction (D4-A0, DESIGN.md). Local and staging only: the
 * /dev layout answers 404 in production.
 *
 * This is a specimen sheet, not a screen. The markup below shows what the tokens produce; the real
 * components (Button, StatusBadge, DataTable, ProductCard, CartSupplierGroup) are built in D4-A1 /
 * D4-A2 and must look like this. The Montenegrin samples are written out here on purpose — next-intl
 * arrives with D3-A4, and real screens take every string from its catalogue.
 *
 * ?font=schibsted | hanken renders the whole page in that candidate.
 */
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { CONTRAST_PAIRS, contrastRatio } from "@/lib/design/contrast";
import { COLOR_TOKENS, tokenHex } from "@/lib/design/tokens";
import { CANDIDATES, type CandidateKey } from "./fonts";
import { TileAdd } from "./tile-add";

const SAMPLE = "Profesionalni frižider za restoran — 1.234,56 €";
const PRICES = [
  "1.234,56 €",
  "987,10 €",
  "11.111,11 €",
  "78,00 €",
  "4.107,41 €",
];

/** Sets the one font variable the tokens read (globals.css → --font-sans). */
function fontStyle(key: CandidateKey): CSSProperties {
  return { "--font-app": CANDIDATES[key].fontFamily } as CSSProperties;
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border py-8">
      <h2 className="text-xl">{title}</h2>
      {note ? (
        <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
          {note}
        </p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

// ── Badges: tint + dot + label. Not clickable, so no border, no solid fill, smaller than any button.
const TONES = {
  positive: "bg-positive-bg text-positive-text",
  attention: "bg-attention-bg text-attention-text",
  negative: "bg-negative-bg text-negative-text",
  neutral: "bg-neutral-bg text-neutral-text",
  progress: "bg-progress-bg text-progress-text",
} as const;
type Tone = keyof typeof TONES;

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

const BADGE_SETS: { title: string; badges: [Tone, string][] }[] = [
  {
    title: "Sub-order status",
    badges: [
      ["attention", "Na čekanju"],
      ["progress", "Potvrđeno"],
      ["progress", "Poslato"],
      ["positive", "Isporučeno"],
      ["negative", "Otkazano"],
    ],
  },
  {
    title: "Stock",
    badges: [
      ["positive", "Na stanju · 24 kom"],
      ["attention", "Nema na stanju"],
      ["neutral", "Dostupnost nepoznata"],
    ],
  },
  {
    title: "Card payment",
    badges: [
      ["attention", "Čeka uplatu"],
      ["positive", "Plaćeno"],
      ["negative", "Odbijeno"],
      ["negative", "Isteklo"],
      ["neutral", "Vraćeno 120,00 €"],
    ],
  },
  {
    title: "Contract",
    badges: [
      ["attention", "Zatražen"],
      ["positive", "Aktivan"],
      ["negative", "Odbijen"],
      ["neutral", "Okončan"],
    ],
  },
];

// ── Buttons (one height, one radius). Solid green exists once on this page.
const BTN =
  "inline-flex h-(--control-h) items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors disabled:opacity-50";
const BTN_PRIMARY = `${BTN} bg-primary text-primary-foreground hover:bg-primary-hover`;
const BTN_SECONDARY = `${BTN} border border-input bg-background text-foreground hover:bg-surface`;
const BTN_GHOST = `${BTN} text-primary hover:bg-surface`;
const BTN_DESTRUCTIVE = `${BTN} bg-destructive text-primary-foreground hover:bg-destructive-hover`;

const ORDERS: {
  no: string;
  date: string;
  supplier: string;
  tone: Tone;
  status: string;
  total: string;
}[] = [
  {
    no: "P-2026-000412",
    date: "26.11.2026",
    supplier: "Mesnica Durmitor d.o.o.",
    tone: "attention",
    status: "Na čekanju",
    total: "1.234,56 €",
  },
  {
    no: "P-2026-000409",
    date: "24.11.2026",
    supplier: "Voćar Zeta d.o.o.",
    tone: "progress",
    status: "Poslato",
    total: "987,10 €",
  },
  {
    no: "P-2026-000398",
    date: "19.11.2026",
    supplier: "HoReCa Oprema Bar d.o.o.",
    tone: "positive",
    status: "Isporučeno",
    total: "11.111,11 €",
  },
];

function OrdersTable({ density }: { density: "comfortable" | "compact" }) {
  const rowH =
    density === "comfortable"
      ? "h-(--row-h-comfortable)"
      : "h-(--row-h-compact)";
  return (
    <div className="relative overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead className="bg-surface text-left text-muted-foreground">
          <tr className="h-10">
            <th scope="col" className="px-4 font-medium">
              Porudžbina
            </th>
            <th scope="col" className="px-4 font-medium">
              Datum
            </th>
            <th scope="col" className="px-4 font-medium">
              Dobavljač
            </th>
            <th scope="col" className="px-4 font-medium">
              Status
            </th>
            <th scope="col" className="px-4 text-right font-medium">
              Ukupno
            </th>
            <th scope="col" className="px-4">
              <span className="sr-only">Radnje</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ORDERS.map((o, i) => (
            <tr
              key={o.no}
              className={`${rowH} border-t border-border transition-colors hover:bg-surface ${i === 1 ? "bg-selected" : ""}`}
            >
              <th
                scope="row"
                className="px-4 text-left font-medium tabular-nums"
              >
                {o.no}
              </th>
              <td className="px-4 text-muted-foreground tabular-nums">
                {o.date}
              </td>
              <td className="px-4">{o.supplier}</td>
              <td className="px-4">
                <Badge tone={o.tone}>{o.status}</Badge>
              </td>
              <td className="px-4 text-right font-medium tabular-nums">
                {o.total}
              </td>
              <td className="px-4">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    className="h-8 rounded-md px-2 text-sm font-semibold text-primary hover:bg-surface"
                  >
                    Otvorite
                  </button>
                  <button
                    type="button"
                    aria-label={`Još radnji za ${o.no}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface"
                  >
                    {/* Stand-in until the icon set (lucide, 1.5 px stroke) arrives with D4-A1. */}
                    <svg
                      aria-hidden
                      viewBox="0 0 16 16"
                      className="size-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <circle cx="3" cy="8" r="1" />
                      <circle cx="8" cy="8" r="1" />
                      <circle cx="13" cy="8" r="1" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tile({
  name,
  supplier,
  price,
  badge,
  badgeNote,
  disabled,
}: {
  name: string;
  supplier: string;
  price: string;
  badge: ReactNode;
  /** Caption next to the badge — a badge label itself stays short (DESIGN.md → Badges). */
  badgeNote?: string;
  disabled?: boolean;
}) {
  return (
    <article className="flex w-full min-w-0 flex-col rounded-md border border-border bg-background">
      {/* Square well: the same neutral grey behind every photo (object-fit: contain on the real tile). */}
      <div className="flex aspect-square items-center justify-center rounded-t-md bg-well text-xs text-muted-foreground">
        fotografija 1:1
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 text-base">{name}</h3>
        <p className="text-sm text-muted-foreground">{supplier}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {badge}
          {badgeNote ? (
            <span className="text-xs text-muted-foreground">{badgeNote}</span>
          ) : null}
        </div>
        <p className="mt-auto pt-1">
          <span className="text-lg font-semibold tabular-nums">{price}</span>{" "}
          <span className="text-xs text-muted-foreground">bez PDV-a</span>
        </p>
        <TileAdd disabled={disabled} />
      </div>
    </article>
  );
}

function ModeOption({
  name,
  value,
  title,
  consequence,
  defaultChecked,
  disabled,
  children,
}: {
  name: string;
  value: string;
  title: string;
  consequence: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border has-[:checked]:border-primary has-[:checked]:bg-selected">
      <label className={`flex gap-3 p-4 ${disabled ? "" : "cursor-pointer"}`}>
        <input
          type="radio"
          name={name}
          value={value}
          defaultChecked={defaultChecked}
          disabled={disabled}
          className="mt-1 size-4 accent-primary"
        />
        <span>
          <span
            className={`block text-base font-medium ${disabled ? "text-muted-foreground" : ""}`}
          >
            {title}
          </span>
          <span className="block text-sm text-muted-foreground">
            {consequence}
          </span>
        </span>
      </label>
      {children ? <div className="px-4 pb-4 pl-11">{children}</div> : null}
    </div>
  );
}

export default async function StylePreviewPage({
  searchParams,
}: PageProps<"/dev/style">) {
  const { font } = await searchParams;
  const active: CandidateKey = font === "hanken" ? "hanken" : "schibsted";

  return (
    <main
      style={fontStyle(active)}
      className="mx-auto w-full max-w-[1200px] px-4 pb-16 font-sans md:px-8"
    >
      <header className="py-8">
        <h1 className="text-2xl">Design direction — preview</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
          Tokens from globals.css, rules from DESIGN.md. Not a screen. This page
          is rendered in{" "}
          <strong className="font-semibold text-foreground">
            {CANDIDATES[active].label}
          </strong>
          .
        </p>
        <nav
          aria-label="Typeface for this page"
          className="mt-4 flex flex-wrap gap-2"
        >
          {(Object.keys(CANDIDATES) as CandidateKey[]).map((key) => (
            <Link
              key={key}
              href={`/dev/style?font=${key}`}
              aria-current={key === active ? "page" : undefined}
              className={`${BTN_SECONDARY} aria-[current=page]:border-primary aria-[current=page]:bg-selected`}
            >
              {CANDIDATES[key].label}
            </Link>
          ))}
        </nav>
      </header>

      <Section
        title="Colour tokens"
        note="Every colour the UI may use. Ratios below are computed from these values (WCAG 2.x)."
      >
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
          {COLOR_TOKENS.map((t) => (
            <li key={t.name}>
              <div
                className="h-14 rounded-md border border-border"
                style={{ background: t.hex }}
              />
              <p className="mt-2 text-sm font-medium">--{t.name}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {t.hex.toUpperCase()}
              </p>
              <p className="text-xs text-muted-foreground">{t.use}</p>
            </li>
          ))}
        </ul>

        <h3 className="mt-10 text-lg">Allowed pairs and their contrast</h3>
        <div className="relative mt-4 overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="bg-surface text-left text-muted-foreground">
              <tr className="h-10">
                <th scope="col" className="px-4 font-medium">
                  Sample
                </th>
                <th scope="col" className="px-4 font-medium">
                  Foreground on background
                </th>
                <th scope="col" className="px-4 font-medium">
                  Use
                </th>
                <th scope="col" className="px-4 text-right font-medium">
                  Ratio
                </th>
                <th scope="col" className="px-4 text-right font-medium">
                  Minimum
                </th>
              </tr>
            </thead>
            <tbody>
              {CONTRAST_PAIRS.map((p) => {
                const fg = tokenHex(p.fg);
                const bg = tokenHex(p.bg);
                const isLine = p.min === 3;
                return (
                  <tr
                    key={`${p.fg}/${p.bg}/${p.use}`}
                    className="h-(--row-h-compact) border-t border-border"
                  >
                    <td className="px-4">
                      <span
                        className="inline-flex h-7 items-center rounded-md px-2 text-sm font-medium tabular-nums"
                        style={
                          isLine
                            ? { background: bg, border: `2px solid ${fg}` }
                            : { background: bg, color: fg }
                        }
                      >
                        {isLine ? "    " : "Šđčćž 1.234,56 €"}
                      </span>
                    </td>
                    <td className="px-4">
                      --{p.fg} on --{p.bg}
                    </td>
                    <td className="px-4 text-muted-foreground">{p.use}</td>
                    <td className="px-4 text-right font-medium tabular-nums">
                      {contrastRatio(fg, bg).toFixed(2)}:1
                    </td>
                    <td className="px-4 text-right text-muted-foreground tabular-nums">
                      {p.min}:1
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Typeface candidates"
        note="Same sample, same sizes, side by side. Pick by looking; the links at the top render the whole page in either one."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          {(Object.keys(CANDIDATES) as CandidateKey[]).map((key) => (
            <div
              key={key}
              style={fontStyle(key)}
              className="rounded-md border border-border p-6 font-sans"
            >
              <p className="text-sm text-muted-foreground">
                {CANDIDATES[key].label}
              </p>
              <p className="mt-3 text-2xl font-semibold">{SAMPLE}</p>
              <p className="mt-3 text-base">{SAMPLE}</p>
              <p className="mt-3 text-base">
                č ć š ž đ · Č Ć Š Ž Đ · Đurđevića Tara, Žabljak, Šavnik, Čanj,
                Nikšić
              </p>
              <p className="mt-3 text-sm">
                <span className="font-normal">Regular 400</span> ·{" "}
                <span className="font-medium">Medium 500</span> ·{" "}
                <span className="font-semibold">Semibold 600</span>
              </p>
              <div className="mt-6 grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-muted-foreground">
                    tabular-nums (the rule)
                  </p>
                  <ul className="mt-2 border-t border-border text-right text-base tabular-nums">
                    {PRICES.map((p) => (
                      <li key={p} className="border-b border-border py-1.5">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    font default (for comparison)
                  </p>
                  <ul className="mt-2 border-t border-border text-right text-base">
                    {PRICES.map((p) => (
                      <li key={p} className="border-b border-border py-1.5">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                {CANDIDATES[key].note}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Type scale"
        note="Six steps. Hierarchy comes from size and weight only; headings are always semibold, upright, in the text colour."
      >
        <dl className="grid gap-4">
          {[
            ["H1 · 28 / 36 · semibold", "text-2xl font-semibold", "Porudžbine"],
            [
              "H2 · 22 / 30 · semibold",
              "text-xl font-semibold",
              "Dobavljači u ovoj porudžbini",
            ],
            [
              "H3 · 18 / 26 · semibold",
              "text-lg font-semibold",
              "Adresa isporuke",
            ],
            [
              "Body · 16 / 24 · regular",
              "text-base",
              "Porudžbina je podijeljena po dobavljačima. Svaki dio ima svoj status.",
            ],
            [
              "Small · 14 / 20 · regular (tables, help text)",
              "text-sm",
              "Cijene su prikazane bez PDV-a.",
            ],
            [
              "Caption · 12 / 16 · regular",
              "text-xs text-muted-foreground",
              "Provjereno 26.11.2026 u 14:32",
            ],
          ].map(([label, cls, text]) => (
            <div
              key={label}
              className="grid gap-1 md:grid-cols-[280px_1fr] md:items-baseline"
            >
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className={cls}>{text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        title="Buttons"
        note="One solid green button per view — this is the only one on this page. Everything else is secondary, ghost or destructive."
      >
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={BTN_PRIMARY}>
            Potvrdite porudžbinu
          </button>
          <button type="button" className={BTN_SECONDARY}>
            Sačuvajte nacrt
          </button>
          <button type="button" className={BTN_GHOST}>
            Odustanite
          </button>
          <button type="button" className={BTN_DESTRUCTIVE}>
            Otkažite porudžbinu
          </button>
          <button type="button" disabled className={BTN_SECONDARY}>
            Nedostupno
          </button>
          <button type="button" disabled aria-busy className={BTN_SECONDARY}>
            <span
              aria-hidden
              className="size-4 animate-spin rounded-full border-2 border-input border-t-transparent"
            />
            Šaljemo…
          </button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Press Tab to see the focus ring (2 px, offset 2 px). A link in text
          looks like{" "}
          <a
            href="#top"
            className="font-medium text-primary underline underline-offset-2"
          >
            Pogledajte ugovor
          </a>
          .
        </p>
      </Section>

      <Section
        title="Badges"
        note="One set for buyer, supplier and admin. Soft tint, dot and label — never a solid fill, so a badge cannot be mistaken for a button."
      >
        <dl className="grid gap-5">
          {BADGE_SETS.map((set) => (
            <div
              key={set.title}
              className="grid gap-2 md:grid-cols-[180px_1fr] md:items-center"
            >
              <dt className="text-sm text-muted-foreground">{set.title}</dt>
              <dd className="flex flex-wrap gap-2">
                {set.badges.map(([tone, label]) => (
                  <Badge key={label} tone={tone}>
                    {label}
                  </Badge>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        title="Table rows"
        note="Six visible columns, amounts right-aligned in tabular figures, one visible action per row and a menu for the rest. The middle row is the selected one (its detail is open in the side panel)."
      >
        <h3 className="text-sm font-medium text-muted-foreground">
          Buyer — comfortable, 56 px rows
        </h3>
        <div className="mt-2">
          <OrdersTable density="comfortable" />
        </div>
        <h3 className="mt-8 text-sm font-medium text-muted-foreground">
          Supplier / admin — compact, 40 px rows
        </h3>
        <div className="mt-2">
          <OrdersTable density="compact" />
        </div>
      </Section>

      <Section
        title="Catalogue tile"
        note="Square image well, name, supplier, stock badge, price, add button. The add button is secondary (a grid holds many of them) and becomes a quantity stepper once tapped."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            name="Profesionalni frižider za restoran, 700 l, inox"
            supplier="HoReCa Oprema Bar d.o.o."
            price="1.234,56 €"
            badge={<Badge tone="positive">Na stanju · 24 kom</Badge>}
          />
          <Tile
            name="Maslinovo ulje ekstra djevičansko, 5 l"
            supplier="Voćar Zeta d.o.o."
            price="78,00 €"
            badge={<Badge tone="attention">Nema na stanju</Badge>}
            disabled
          />
          <Tile
            name="Njeguški pršut, rezani, 500 g"
            supplier="Mesnica Durmitor d.o.o."
            price="14,90 €"
            badge={<Badge tone="neutral">Dostupnost nepoznata</Badge>}
            badgeNote="Provjereno u 14:32"
            disabled
          />
        </div>
      </Section>

      <Section
        title="Purchase mode per supplier"
        note="Radio options that state the consequence in plain words. When direct ordering is unavailable, the option says why and offers the way out in the same place."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <fieldset>
            <legend className="text-base font-semibold">
              Mesnica Durmitor d.o.o. — način kupovine
            </legend>
            <p className="mb-3 text-sm text-muted-foreground">
              Imate aktivan ugovor sa ovim dobavljačem.
            </p>
            <div className="grid gap-2">
              <ModeOption
                name="mode-a"
                value="direct"
                defaultChecked
                title="Dobavljač Vam fakturiše direktno"
                consequence="Plaćate dobavljaču po uslovima Vašeg ugovora. Platforma Vam ne naplaćuje ništa."
              />
              <ModeOption
                name="mode-a"
                value="platform"
                title="Platite odmah karticom"
                consequence="1.234,56 € naplaćujemo sa Vaše kartice čim potvrdite porudžbinu."
              />
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-base font-semibold">
              Voćar Zeta d.o.o. — način kupovine
            </legend>
            <p className="mb-3 text-sm text-muted-foreground">
              Nemate ugovor sa ovim dobavljačem.
            </p>
            <div className="grid gap-2">
              <ModeOption
                name="mode-b"
                value="platform"
                defaultChecked
                title="Platite odmah karticom"
                consequence="987,10 € naplaćujemo sa Vaše kartice čim potvrdite porudžbinu."
              />
              <ModeOption
                name="mode-b"
                value="direct"
                disabled
                title="Dobavljač Vam fakturiše direktno"
                consequence="Nije dostupno: za direktnu kupovinu potreban je aktivan ugovor sa dobavljačem."
              >
                <button type="button" className={BTN_SECONDARY}>
                  Zatražite ugovor
                </button>
              </ModeOption>
            </div>
          </fieldset>
        </div>
      </Section>
    </main>
  );
}
