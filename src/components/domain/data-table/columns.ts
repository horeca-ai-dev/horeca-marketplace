/**
 * Column definitions for DataTable (TanStack Table v9, core features only — sorting and paging happen
 * on the server through URL links, so no client row models are registered).
 *
 * Columns contain render functions, so they are defined in a Client Component module next to the
 * screen's table (e.g. `products-table.tsx`), never passed from a Server Component:
 *
 *   const col = dataTableColumns<ProductRow>();
 *   const columns = col.columns([
 *     col.accessor("name", { header: t("name"), meta: { mobile: "title", sortKey: "name" } }),
 *     col.accessor("status", { header: t("status"), cell: (c) => <StatusBadge entity="product" status={c.getValue()} />, meta: { mobile: "meta" } }),
 *     col.accessor("priceNetCents", { header: t("price"), cell: (c) => <MoneyText cents={c.getValue()} tabular />, meta: { align: "end", mobile: "meta" } }),
 *   ]);
 */
import {
  createColumnHelper,
  metaHelper,
  tableFeatures,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";

export type DataTableColumnMeta = {
  /** "end" for amounts, quantities, dates and numbers (DESIGN.md: right-aligned in a column). */
  align?: "start" | "end";
  /** The `sort` URL value; set it to make the header a sort link. The page allow-lists these keys. */
  sortKey?: string;
  /**
   * Below `md` the table becomes stacked rows: `title` is the first line (and the link that opens the
   * row — one column), `meta` columns share the second line, `hidden` ones are left out. Default: hidden.
   */
  mobile?: "title" | "meta" | "hidden";
};

export const dataTableFeatures = tableFeatures({
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableFeatures = typeof dataTableFeatures;

export function dataTableColumns<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

export type DataTableColumn<TData extends RowData> = ColumnDef<
  DataTableFeatures,
  TData,
  // Each column has its own value type; the table only needs the common shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;
