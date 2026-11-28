"use client";

/**
 * Account menu in the header. For now: who you act as, and sign-out (useSignOut: Better Auth's own
 * endpoint, then a full page load of /login).
 */
import { LogOut, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { type Area, AREAS } from "./nav";
import { useSignOut } from "./use-sign-out";

export function UserMenu({ area }: { area: Area }) {
  const t = useTranslations();
  const { status, signOut } = useSignOut();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" aria-label={t("shell.accountMenu")}>
          <Icon icon={UserRound} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t(AREAS[area].orgTypeKey)}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={status === "pending"}
          onSelect={(event) => {
            // Keep the menu open: it shows the pending text and, on failure, the error.
            event.preventDefault();
            void signOut();
          }}
        >
          <Icon icon={LogOut} />
          {status === "pending" ? t("shell.loggingOut") : t("shell.logout")}
        </DropdownMenuItem>
        {status === "failed" ? (
          <p role="alert" className="px-3 py-2 text-sm text-negative-text">
            {t("shell.logoutFailed")}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
