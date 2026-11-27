/**
 * Table primitives (shadcn/ui source on our tokens — DESIGN.md → Operations mode, "Tables"):
 * header on `--surface`, 14 px medium; rows separated by 1 px `--border`, hover `--surface`, the
 * selected row `--selected`; no zebra stripes. The scroll wrapper is `position: relative` and the
 * header cells are sticky, so the header stays in view while the wrapper scrolls.
 *
 * Header cells get `scope="col"` by default. Amount columns are right-aligned by the caller (DataTable
 * does it from the column's meta).
 */
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Table({
  className,
  wrapperClassName,
  ...props
}: ComponentProps<"table"> & { wrapperClassName?: string }) {
  return (
    <div
      data-slot="table-wrapper"
      className={cn("relative w-full overflow-auto", wrapperClassName)}
    >
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom border-collapse text-sm",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={className} {...props} />;
}

function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border transition-colors data-[state=selected]:bg-selected",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({
  className,
  scope = "col",
  ...props
}: ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      scope={scope}
      className={cn(
        "sticky top-0 z-10 h-10 border-b border-border bg-surface px-3 text-left align-middle font-medium whitespace-nowrap text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-3 align-middle", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
};
