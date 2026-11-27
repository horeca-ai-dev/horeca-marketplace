/**
 * MoneyText (DESIGN.md → Components, Typography "Figures"): integer cents → "1.234,56 €".
 *
 *   <MoneyText cents={product.priceNetCents} />          proportional — a tile, a sentence, a heading
 *   <MoneyText cents={line.grossCents} tabular />        tabular, right-aligned — a column of amounts
 *
 * Formatting only: it never calculates (money arithmetic lives in src/server/domain/money.ts). This
 * and DataTable are the only places that set `tabular-nums`. "neto" / "PDV" / "ukupno" labels are the
 * caller's, next to the amount, where it would otherwise be ambiguous.
 *
 * No "use client": works in Server and Client Components (a bigint prop crosses the boundary).
 */
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MoneyText({
  cents,
  tabular = false,
  className,
}: {
  cents: bigint;
  /** Tabular figures, right-aligned — only where amounts stack in a column. */
  tabular?: boolean;
  className?: string;
}) {
  return (
    <span
      data-slot="money"
      className={cn(
        "whitespace-nowrap",
        tabular && "block text-right tabular-nums",
        className,
      )}
    >
      {formatMoney(cents)}
    </span>
  );
}
