"use client";

/**
 * Organization switcher (D7-A3; DESIGN.md → Layout "Org switcher") — only for a user with two or
 * more organizations (OrgSlot decides). The trigger is the OrgBadge of the organization acted for,
 * so "who you act as" stays visible; the menu lists every organization of the user.
 *
 * Switching is Better Auth's own endpoint (POST /api/auth/organization/set-active — no Server
 * Action of ours); membership is checked there and again by resolveSession on the next request.
 * What happens after the answer is decided by switchOrganization (src/lib/auth/org-switch.ts):
 *
 *   switched            → a FULL page load of the new organization's area (nothing rendered for the
 *                         old organization stays in memory)
 *   refused, restored   → a calm error in the menu; the user still acts for the organization shown
 *   refused, unrestored → a full page load of "/": the server decides and renders the truth
 *
 * Keyboard and focus are Radix' menu: Enter / Space / ArrowDown open it, arrows move, Esc closes
 * and returns focus to the trigger. The active organization has aria-current, a check mark and a
 * hidden "(aktivna)" — not every screen reader announces aria-current inside a menu.
 */
import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { OrgBadge } from "@/components/domain/org-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { authClient } from "@/lib/auth-client";
import { loadPage } from "@/lib/auth/load-page";
import { switchOrganization } from "@/lib/auth/org-switch";
import type { MyOrganization } from "@/server/domain/my-organizations";

type Status = "idle" | "pending" | "failed";

/** The platform shows its type only (as in OrgSlot); companies show type and legal name. */
const nameOf = (organization: MyOrganization) =>
  organization.type === "platform" ? undefined : organization.legalName;

export function OrgSwitcher({
  organizations,
}: {
  organizations: MyOrganization[];
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const active = organizations.find((o) => o.active);

  async function choose(targetId: string) {
    setStatus("pending");
    const outcome = await switchOrganization({
      organizations,
      targetId,
      setActive: async (organizationId) => {
        const { error } = await authClient.organization.setActive({
          organizationId,
        });
        return !error;
      },
    });
    if (outcome.kind === "switched") return loadPage(outcome.to);
    if (outcome.kind === "refused" && !outcome.restored) return loadPage("/");
    setStatus(outcome.kind === "refused" ? "failed" : "idle");
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        // While a switch is under way the menu stays: its answer (a page load or the error) is
        // shown here. Closing the menu afterwards clears the error.
        if (status === "pending") return;
        if (!next) setStatus("idle");
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="min-w-0 shrink px-2">
          {active ? (
            <OrgBadge type={active.type} name={nameOf(active)} />
          ) : null}
          <span className="sr-only">{t("switchOrganization")}</span>
          <Icon
            icon={ChevronDown}
            size={16}
            className="shrink-0 text-muted-foreground"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel>{t("yourOrganizations")}</DropdownMenuLabel>
        {organizations.map((organization) => (
          <DropdownMenuItem
            key={organization.organizationId}
            aria-current={organization.active ? "true" : undefined}
            disabled={status === "pending"}
            onSelect={(event) => {
              // The active one: nothing to do, the menu simply closes.
              if (organization.active) return;
              // Keep the menu open: it shows the pending text and, on failure, the error.
              event.preventDefault();
              void choose(organization.organizationId);
            }}
          >
            <OrgBadge
              type={organization.type}
              name={nameOf(organization)}
              className="flex-1"
            />
            {organization.active ? (
              <>
                <Icon icon={Check} size={16} className="text-primary" />
                <span className="sr-only">{t("activeOrganization")}</span>
              </>
            ) : null}
          </DropdownMenuItem>
        ))}
        {status === "pending" ? (
          <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
            {t("switchingOrganization")}
          </p>
        ) : null}
        {status === "failed" ? (
          <p
            role="alert"
            className="max-w-72 px-3 py-2 text-sm text-negative-text"
          >
            {t("switchOrganizationFailed")}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
