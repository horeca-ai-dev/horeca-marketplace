/**
 * /dev/style → "Components" (D4-A2): the shared components as screens will use them, for review in
 * the browser. State switches are links (`?table=empty|loading`, `?density=comfortable`), and `?open=`
 * opens the side panel — the same URL pattern real tables use.
 */
import Link from "next/link";
import { SidePanel } from "@/components/domain/data-table/side-panel";
import { EmptyState } from "@/components/domain/empty-state";
import { MoneyText } from "@/components/domain/money-text";
import { OrgBadge } from "@/components/domain/org-badge";
import { PageSkeleton } from "@/components/domain/page-skeleton";
import { StatusBadge } from "@/components/domain/status-badge/status-badge";
import { TONES } from "@/components/domain/status-badge/status-map";
import { ToneBadge } from "@/components/domain/status-badge/tone-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DemoSubOrdersTable,
  FormPrimitives,
  ToastButtons,
  type DemoSubOrder,
} from "./components-demo";
import { Section } from "./section";

const ROWS: DemoSubOrder[] = [
  {
    id: "so-1",
    number: "P-2026-000123-1",
    buyer: "Hotel Primorje d.o.o.",
    placedAt: new Date("2026-11-26T09:14:00Z"),
    mode: "platform",
    status: "pending",
    grossCents: BigInt(123456),
  },
  {
    id: "so-2",
    number: "P-2026-000122-2",
    buyer: "Restoran Stari grad",
    placedAt: new Date("2026-11-25T16:40:00Z"),
    mode: "direct",
    status: "confirmed",
    grossCents: BigInt(98710),
  },
  {
    id: "so-3",
    number: "P-2026-000119-1",
    buyer: "Kafić Centar — Podgorica, Bulevar Svetog Petra Cetinjskog 1",
    placedAt: new Date("2026-11-24T11:05:00Z"),
    mode: "platform",
    status: "shipped",
    grossCents: BigInt(1111111),
  },
  {
    id: "so-4",
    number: "P-2026-000117-3",
    buyer: "Hotel Lovćen",
    placedAt: new Date("2026-11-20T08:30:00Z"),
    mode: "direct",
    status: "delivered",
    grossCents: BigInt(7800),
  },
  {
    id: "so-5",
    number: "P-2026-000111-1",
    buyer: "Konoba Đurđevića Tara",
    placedAt: new Date("2026-11-18T13:12:00Z"),
    mode: "platform",
    status: "cancelled",
    grossCents: BigInt(410741),
  },
];

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function StateLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: string;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      className={cn(active && "bg-selected font-semibold")}
    >
      <Link href={href} scroll={false} aria-current={active || undefined}>
        {children}
      </Link>
    </Button>
  );
}

export function ComponentsSection({ searchParams }: { searchParams: Params }) {
  const tableState = one(searchParams.table);
  const density =
    one(searchParams.density) === "comfortable" ? "comfortable" : "compact";
  const page = Math.max(1, Number(one(searchParams.page)) || 1);
  const open = ROWS.find((r) => r.id === one(searchParams.open));
  const base = (extra: Record<string, string>) => {
    const p = new URLSearchParams(extra);
    if (density === "comfortable") p.set("density", "comfortable");
    const s = p.toString();
    return `/dev/style${s ? `?${s}` : ""}#components`;
  };

  return (
    <div id="components">
      <Section
        title="Components — badges"
        note="StatusBadge: tone + dot + label from the catalogue, for every status in every area. Five tones only."
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-2">
            {TONES.map((tone) => (
              <ToneBadge key={tone} tone={tone}>
                {tone}
              </ToneBadge>
            ))}
          </div>
          <dl className="grid gap-3 text-sm md:grid-cols-[12rem_1fr]">
            <dt className="text-muted-foreground">Podporudžbina</dt>
            <dd className="flex flex-wrap gap-2">
              {(
                [
                  "pending",
                  "confirmed",
                  "shipped",
                  "delivered",
                  "cancelled",
                ] as const
              ).map((s) => (
                <StatusBadge key={s} entity="subOrder" status={s} />
              ))}
            </dd>
            <dt className="text-muted-foreground">Plaćanje karticom</dt>
            <dd className="flex flex-wrap gap-2">
              <StatusBadge entity="cardPayment" status="pending" />
              <StatusBadge entity="cardPayment" status="succeeded" />
              <StatusBadge entity="cardPayment" status="expired" />
              <StatusBadge
                entity="cardPayment"
                status="refunded"
                values={{ amount: "120,00 €" }}
              />
            </dd>
            <dt className="text-muted-foreground">Ugovor</dt>
            <dd className="flex flex-wrap gap-2">
              <StatusBadge entity="contract" status="requested" />
              <StatusBadge entity="contract" status="active" />
              <StatusBadge entity="contract" status="ended" />
            </dd>
            <dt className="text-muted-foreground">Zaliha</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <StatusBadge
                entity="stock"
                status="in_stock"
                values={{ qty: 24, unit: "kom" }}
              />
              <StatusBadge entity="stock" status="out_of_stock" />
              <StatusBadge entity="stock" status="unknown" />
              <span className="text-xs text-muted-foreground">
                Provjereno u 14:32
              </span>
            </dd>
            <dt className="text-muted-foreground">Slanje dobavljaču</dt>
            <dd className="flex flex-wrap gap-2">
              <StatusBadge entity="submission" status="pending" />
              <StatusBadge entity="submission" status="failed" />
            </dd>
            <dt className="text-muted-foreground">
              Plaćanje porudžbine (not_applicable → ništa)
            </dt>
            <dd className="flex flex-wrap gap-2">
              <StatusBadge entity="orderPayment" status="unpaid" />
              <StatusBadge entity="orderPayment" status="refund_due" />
              <StatusBadge entity="orderPayment" status="not_applicable" />
            </dd>
          </dl>
        </div>
      </Section>

      <Section
        title="Components — organization and money"
        note="OrgBadge: icon + type label (+ company), no type colour. MoneyText: proportional by default; `tabular` only where amounts stack in a column."
      >
        <div className="grid gap-8 md:grid-cols-2">
          <div className="flex flex-col items-start gap-3">
            <OrgBadge type="buyer" name="Hotel Primorje d.o.o." />
            <OrgBadge type="supplier" name="Mesnica Durmitor d.o.o." />
            <OrgBadge type="platform" />
          </div>
          <div className="grid grid-cols-2 gap-6 text-base">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                Proporcionalno
              </p>
              {ROWS.map((r) => (
                <p key={r.id}>
                  <MoneyText cents={r.grossCents} />
                </p>
              ))}
            </div>
            <div>
              <p className="mb-2 text-right text-sm text-muted-foreground">
                Tabularno
              </p>
              {ROWS.map((r) => (
                <MoneyText key={r.id} cents={r.grossCents} tabular />
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Components — DataTable"
        note="Sticky header, right-aligned amounts, one visible row action + menu, row click (or Enter on the number) opens the side panel. Below md: stacked rows. Sort, page and open row live in the URL."
      >
        <div className="mb-4 flex flex-wrap gap-1">
          <StateLink href={base({})} active={!tableState}>
            Popunjeno
          </StateLink>
          <StateLink
            href={base({ table: "loading" })}
            active={tableState === "loading"}
          >
            Učitavanje
          </StateLink>
          <StateLink
            href={base({ table: "empty" })}
            active={tableState === "empty"}
          >
            Prazno
          </StateLink>
          <Button asChild variant="ghost">
            <Link
              scroll={false}
              href={
                density === "compact"
                  ? "/dev/style?density=comfortable#components"
                  : "/dev/style#components"
              }
            >
              {density === "compact"
                ? "Gustina: kompaktno (40 px) → udobno"
                : "Gustina: udobno (56 px) → kompaktno"}
            </Link>
          </Button>
        </div>
        <DemoSubOrdersTable
          rows={tableState === "empty" ? [] : ROWS}
          loading={tableState === "loading"}
          density={density}
          page={page}
        />
        {open ? (
          <SidePanel title={`Podporudžbina ${open.number}`} rowId={open.id}>
            <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge entity="subOrder" status={open.status} />
              </dd>
              <dt className="text-muted-foreground">Način</dt>
              <dd>
                <StatusBadge entity="purchaseMode" status={open.mode} />
              </dd>
              <dt className="text-muted-foreground">Kupac</dt>
              <dd className="min-w-0">
                <OrgBadge type="buyer" name={open.buyer} />
              </dd>
              <dt className="text-muted-foreground">Ukupno</dt>
              <dd>
                <MoneyText cents={open.grossCents} />
              </dd>
            </dl>
          </SidePanel>
        ) : null}
      </Section>

      <Section
        title="Components — states and feedback"
        note="EmptyState: one sentence + one next step. PageSkeleton: final sizes, no pulse, no spinner. Toasts only for background results; errors stay until dismissed."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="border border-border">
            <EmptyState
              message="Još nemate ugovora. Zatražite ugovor sa dobavljačem iz korpe ili sa stranice proizvoda."
              action={
                <Button asChild variant="primary">
                  <Link href="/dev/style">Otvorite katalog</Link>
                </Button>
              }
            />
          </div>
          <div className="border border-border p-4">
            <PageSkeleton density="compact" rows={4} />
          </div>
          <ToastButtons />
        </div>
      </Section>

      <Section
        title="Components — form primitives"
        note="Select, Checkbox, RadioGroup and Dialog on our tokens; labels above or around every control."
      >
        <FormPrimitives />
      </Section>
    </div>
  );
}
