"use client";

/**
 * SidePanel (DESIGN.md → Operations mode, "Row → side panel"): the detail of the open table row, on
 * the right (≈ 480 px, floating shadow); full-screen below `md`.
 *
 * The page renders it when `?open=<id>` is set and passes the detail in as children:
 *
 *   {open ? <SidePanel title={order.number} rowId={open}>…</SidePanel> : null}
 *
 * Non-modal: the list stays in view and usable — clicking another row's link switches the panel.
 * Esc or the close button removes `?open=` from the URL, and focus goes back to the row's link.
 * Clicks outside do not close it (a click on another row is a navigation, not a dismissal).
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { closeHref } from "./table-url";

export function SidePanel({
  title,
  rowId,
  children,
}: {
  title: string;
  /** The open row's id: focus returns to its link on close. */
  rowId: string;
  children: ReactNode;
}) {
  const t = useTranslations("table");
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  // Closes at once; the URL change follows. Keyed by row, so opening another row re-opens it.
  const [closedFor, setClosedFor] = useState<string | null>(null);

  return (
    <Sheet
      modal={false}
      open={closedFor !== rowId}
      onOpenChange={(open) => {
        if (open) return;
        setClosedFor(rowId);
        router.push(closeHref(pathname, query), { scroll: false });
      }}
    >
      <SheetContent
        side="right"
        closeLabel={t("closePanel")}
        className="w-full max-w-none md:w-[30rem]"
        onInteractOutside={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          // The row link exists twice (table ≥ md, stacked list < md); focus the one on screen.
          const links = document.querySelectorAll<HTMLElement>(
            `[data-row-link="${CSS.escape(rowId)}"]`,
          );
          [...links].find((el) => el.getClientRects().length > 0)?.focus();
        }}
      >
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
