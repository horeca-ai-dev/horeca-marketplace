"use client";

/**
 * DataTable (DESIGN.md → Operations mode, "Tables"; Components, "DataTable").
 *
 * - Rows 56 px (`comfortable`, buyer) or 40 px (`compact`, supplier / admin); header on `--surface`,
 *   sticky inside the scroll wrapper; 1 px row separators, hover `--surface`, open row `--selected`.
 * - Amount columns: `meta.align = "end"` and a <MoneyText tabular /> cell.
 * - Sort, page and the open row are links that change the URL (table-url.ts); the Server Component
 *   page reads them, queries, and passes the rows back in. No client-side fetching or sorting.
 * - Opening a row: the title cell is a real link (Tab + Enter), and a click anywhere on the row does
 *   the same. The page renders the detail in a <SidePanel> when `?open=` is set.
 * - One visible text action per row (`rowAction`) and the rest in a "⋯" menu (`rowMenu`, a list of
 *   DropdownMenuItems) whose accessible name includes the row (`rowLabel`).
 * - `loading`: skeleton rows of the same height. No rows: the designed `empty` state instead.
 * - Below `md`: stacked rows — title, then the `meta` columns, then the row action.
 */
import { useTable, type RowData } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { MouseEvent, ReactNode } from "react";
import { ROW_HEIGHT, type Density } from "@/components/domain/page-skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  dataTableFeatures,
  type DataTableColumn,
  type DataTableColumnMeta,
} from "./columns";
import { openHref, pageHref, readSort, sortHref } from "./table-url";

export type DataTableProps<TData extends RowData> = {
  /** Names the table for screen readers (rendered as a visually hidden caption). */
  caption: string;
  columns: ReadonlyArray<DataTableColumn<TData>>;
  data: TData[];
  getRowId: (row: TData) => string;
  /** Short name of a row for accessible names ("Još radnji: Kafa Espresso 1 kg"). */
  rowLabel: (row: TData) => string;
  density?: Density;
  /** Rows open in a side panel through `?open=<id>`. */
  openable?: boolean;
  rowAction?: (row: TData) => ReactNode;
  /** The row's "⋯" menu items; null / undefined = no menu for this row. */
  rowMenu?: (row: TData) => ReactNode;
  loading?: boolean;
  /** Shown instead of the table when there are no rows (an <EmptyState>). */
  empty: ReactNode;
  /** Server-side paging: the current page (1-based) and how many there are. */
  pagination?: { page: number; pageCount: number };
};

const SKELETON_ROWS = 5;

function metaOf(column: { columnDef: { meta?: DataTableColumnMeta } }) {
  return column.columnDef.meta ?? {};
}

/** A click on a link, button or menu inside the row must not also open the row. */
function isInteractive(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest("a, button, [role=menuitem], input, select, textarea") !==
      null
  );
}

export function DataTable<TData extends RowData>({
  caption,
  columns,
  data,
  getRowId,
  rowLabel,
  density = "compact",
  openable = false,
  rowAction,
  rowMenu,
  loading = false,
  empty,
  pagination,
}: DataTableProps<TData>) {
  const t = useTranslations("table");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const sort = readSort(query);
  const openId = new URLSearchParams(query).get("open");

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId: (row) => getRowId(row),
  });

  const leafColumns = table.getAllLeafColumns();
  const titleColumnId =
    leafColumns.find((c) => metaOf(c).mobile === "title")?.id ??
    leafColumns[0]?.id;
  const hasActions = Boolean(rowAction || rowMenu);
  const rows = table.getRowModel().rows;

  if (!loading && rows.length === 0) return <>{empty}</>;

  const rowHref = (id: string) => openHref(pathname, query, id);
  const onRowClick = (event: MouseEvent, id: string) => {
    if (!openable || isInteractive(event.target)) return;
    router.push(rowHref(id), { scroll: false });
  };

  const menu = (row: TData) => {
    // A row with no menu items (e.g. an archived record) gets no "⋯" button at all.
    const items = rowMenu?.(row);
    return items ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("moreActions", { row: rowLabel(row) })}
            className="shrink-0 text-foreground"
          >
            <Icon icon={Ellipsis} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{items}</DropdownMenuContent>
      </DropdownMenu>
    ) : null;
  };

  const actions = (row: TData) => (
    <div className="flex items-center justify-end gap-1">
      {rowAction?.(row)}
      {menu(row)}
    </div>
  );

  /** The title cell's content, made the row's link when rows open. */
  const titleLink = (id: string, content: ReactNode) =>
    openable ? (
      <Link
        href={rowHref(id)}
        scroll={false}
        data-row-link={id}
        className="rounded-md font-medium text-foreground underline-offset-4 hover:underline"
      >
        {content}
      </Link>
    ) : (
      content
    );

  return (
    <div aria-busy={loading || undefined}>
      {loading ? <span className="sr-only">{tCommon("loading")}</span> : null}

      {/* ≥ md: the table. The wrapper scrolls (both ways), so the sticky header stays in view. */}
      <Table
        wrapperClassName="hidden max-h-[calc(100dvh-12rem)] md:block"
        className="min-w-full"
      >
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="border-b-0">
              {group.headers.map((header) => {
                const meta = metaOf(header.column);
                const active = sort && meta.sortKey === sort.key ? sort : null;
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      meta.sortKey
                        ? active
                          ? active.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                        : undefined
                    }
                    className={cn(meta.align === "end" && "text-right")}
                  >
                    {header.isPlaceholder ? null : meta.sortKey ? (
                      <Link
                        href={sortHref(pathname, query, meta.sortKey)}
                        scroll={false}
                        className={cn(
                          // align-middle: in a reversed row the icon would set the baseline.
                          "inline-flex items-center gap-1 rounded-md align-middle hover:text-primary",
                          meta.align === "end" && "flex-row-reverse",
                        )}
                      >
                        <table.FlexRender header={header} />
                        <Icon
                          icon={
                            active
                              ? active.dir === "asc"
                                ? ArrowUp
                                : ArrowDown
                              : ChevronsUpDown
                          }
                          size={16}
                          className={
                            active ? "text-primary" : "text-muted-foreground"
                          }
                        />
                      </Link>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                );
              })}
              {hasActions ? (
                <TableHead className="text-right">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              ) : null}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <TableRow key={i} className={ROW_HEIGHT[density]}>
                  {leafColumns.map((c) => (
                    <TableCell key={c.id}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                  {hasActions ? <TableCell /> : null}
                </TableRow>
              ))
            : rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.id === openId ? "selected" : undefined}
                  onClick={(e) => onRowClick(e, row.id)}
                  className={cn(
                    ROW_HEIGHT[density],
                    "hover:bg-surface data-[state=selected]:bg-selected",
                    openable && "cursor-pointer",
                  )}
                >
                  {row.getAllCells().map((cell) => {
                    const meta = metaOf(cell.column);
                    const content = <table.FlexRender cell={cell} />;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(meta.align === "end" && "text-right")}
                      >
                        {cell.column.id === titleColumnId
                          ? titleLink(row.id, content)
                          : content}
                      </TableCell>
                    );
                  })}
                  {hasActions ? (
                    <TableCell className="w-px whitespace-nowrap">
                      {actions(row.original)}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
        </TableBody>
      </Table>

      {/* < md: stacked rows. Same data, one list item per row. */}
      <ul aria-label={caption} className="border-t border-border md:hidden">
        {loading
          ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <li
                key={i}
                className="flex flex-col gap-2 border-b border-border py-3"
              >
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-6 w-1/2" />
              </li>
            ))
          : rows.map((row) => {
              const cells = row.getAllCells();
              const title = cells.find((c) => c.column.id === titleColumnId);
              const visibleAction = rowAction?.(row.original);
              const metaCells = cells.filter(
                (c) =>
                  c.column.id !== titleColumnId &&
                  metaOf(c.column).mobile === "meta",
              );
              return (
                <li
                  key={row.id}
                  data-state={row.id === openId ? "selected" : undefined}
                  onClick={(e) => onRowClick(e, row.id)}
                  className="flex flex-col gap-2 border-b border-border px-1 py-3 data-[state=selected]:bg-selected"
                >
                  {/* Title line, with the "⋯" menu at its end so a row without a visible action stays two lines. */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 pt-2 text-base">
                      {title
                        ? titleLink(row.id, <table.FlexRender cell={title} />)
                        : null}
                    </div>
                    {menu(row.original)}
                  </div>
                  {metaCells.length ? (
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                      {metaCells.map((cell) => (
                        <div key={cell.id}>
                          <table.FlexRender cell={cell} />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {visibleAction ? <div>{visibleAction}</div> : null}
                </li>
              );
            })}
      </ul>

      {pagination && pagination.pageCount > 1 ? (
        <nav
          aria-label={t("pagination")}
          className="flex items-center justify-between gap-4 pt-4 text-sm"
        >
          <p className="text-muted-foreground">
            {t("pageOf", {
              page: pagination.page,
              count: pagination.pageCount,
            })}
          </p>
          <div className="flex gap-2">
            <PageLink
              href={pageHref(pathname, query, pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              {t("previous")}
            </PageLink>
            <PageLink
              href={pageHref(pathname, query, pagination.page + 1)}
              disabled={pagination.page >= pagination.pageCount}
            >
              {t("next")}
            </PageLink>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: ReactNode;
}) {
  // A disabled link is not a link: render an inert button (the page number next to it says why).
  if (disabled)
    return (
      <Button disabled aria-disabled="true">
        {children}
      </Button>
    );
  return (
    <Button asChild>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
