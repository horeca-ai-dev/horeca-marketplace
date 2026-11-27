/**
 * PageSkeleton (DESIGN.md → States, "Loading"): the page header plus table rows at their final
 * heights, so nothing shifts when the data arrives. For a route's loading.tsx:
 *
 *   export default function Loading() { return <PageSkeleton density="compact" />; }
 *
 * No spinner (spinners are only for pending buttons) and no pulse. The region is `aria-busy` with a
 * screen-reader-only "Učitavamo…", since the grey blocks themselves are hidden from assistive tech.
 */
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type Density = "comfortable" | "compact";

/** Row heights from globals.css: 56 px (buyer) / 40 px (supplier, admin). */
export const ROW_HEIGHT: Record<Density, string> = {
  comfortable: "h-(--row-h-comfortable)",
  compact: "h-(--row-h-compact)",
};

export function PageSkeleton({
  density = "comfortable",
  rows = 8,
  withDescription = true,
}: {
  density?: Density;
  rows?: number;
  withDescription?: boolean;
}) {
  const t = useTranslations("common");
  return (
    <div aria-busy="true" data-slot="page-skeleton">
      <span className="sr-only">{t("loading")}</span>
      {/* PageHeader: H1 (36 px line) and the optional sentence under it (24 px line). */}
      <Skeleton className="h-9 w-full max-w-64" />
      {withDescription ? (
        <Skeleton className="mt-1 h-6 w-full max-w-96" />
      ) : null}
      {/* The first section starts 32 px below the header; then the table header (40 px) and rows. */}
      <div className="mt-8 border-t border-border">
        <Skeleton className="h-10 rounded-none" />
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center border-b border-border px-3",
              ROW_HEIGHT[density],
            )}
          >
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
