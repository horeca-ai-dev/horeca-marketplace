/**
 * EmptyState (DESIGN.md → States, "Empty"): one sentence saying what will appear here and ONE action
 * that is the next step ("Još nemate porudžbina." + "Otvorite katalog"). No illustration, no icon
 * art, no box — just text and the action, centred in the space the content would take.
 *
 *   <EmptyState message={t("orders.empty")} action={<Button asChild><Link …/></Button>} />
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  message,
  action,
  className,
}: {
  message: string;
  /** The next step — one Button (usually `asChild` around a Link). */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-4 px-4 py-12 text-center",
        className,
      )}
    >
      <p className="max-w-[70ch] text-base text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
