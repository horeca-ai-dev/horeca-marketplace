"use client";

/**
 * Account menu in the header. For now: who you act as, and sign-out. Sign-out calls Better Auth's
 * own endpoint (POST /api/auth/sign-out) through its client — no Server Action of ours.
 *
 * After signing out the browser LOADS /login (a full navigation, not a client-side one), so nothing
 * rendered for the signed-in user stays in memory.
 */
import { useState } from "react";
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
import { authClient } from "@/lib/auth-client";
import {
  browserDraftStorage,
  clearCompanyDraft,
} from "@/lib/auth/company-draft";
import { type Area, AREAS } from "./nav";

type Status = "idle" | "pending" | "failed";

export function UserMenu({ area }: { area: Area }) {
  const t = useTranslations();
  const [status, setStatus] = useState<Status>("idle");

  async function signOut() {
    setStatus("pending");
    // A half-finished registration may have left company data in this tab (company-draft.ts):
    // it must not outlive the session, whether or not the sign-out request succeeds.
    clearCompanyDraft(browserDraftStorage());
    const { error } = await authClient.signOut().catch(() => ({ error: true }));
    if (error) {
      setStatus("failed");
      return;
    }
    // Deliberately a full page load, not router.push(): see the comment at the top.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

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
