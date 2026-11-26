"use client";

/**
 * Navigation on small screens: a menu button in the header opens the same links in a sheet
 * (Radix Dialog: focus moves in, Tab stays inside, Esc closes, focus returns to the button).
 * Following a link closes the sheet.
 */
import { useState } from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { type Area, AREAS } from "./nav";
import { NavList } from "./nav-list";

export function MobileNav({
  area,
  className,
}: {
  area: Area;
  className?: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          aria-label={t("shell.openMenu")}
          className={className}
        >
          <Icon icon={Menu} />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" closeLabel={t("shell.closeMenu")}>
        <SheetHeader>
          <SheetTitle>{t("shell.menuTitle")}</SheetTitle>
          <SheetDescription>{t(AREAS[area].orgTypeKey)}</SheetDescription>
        </SheetHeader>
        <nav
          aria-label={t("shell.mainNavigation")}
          className="overflow-y-auto border-t border-border p-2"
        >
          <NavList
            area={area}
            layout="column"
            onNavigate={() => setOpen(false)}
          />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
