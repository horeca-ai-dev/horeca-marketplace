"use client";

/**
 * "Arhivirajte" confirmation (D5-A3; matrix: buyerLocation.archive — every buyer member).
 *
 * The destructive button lives only here, inside the confirmation (DESIGN.md → Button). The server
 * refuses to archive the default location (409 DEFAULT_LOCATION_ARCHIVE): that message is shown in
 * the dialog, so the user reads it where they acted and can cancel.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { notify } from "@/components/domain/toaster";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadPage } from "@/lib/auth/load-page";
import {
  mapCompanyActionError,
  type CompanyFormErrorKey,
} from "@/lib/company/form-errors";
import { archiveLocationAction } from "@/server/actions/company";
import type { LocationRow } from "./location-row";

export function ArchiveLocationDialog({
  location,
  onClose,
  onArchived,
}: {
  /** The location to archive; null = the dialog is closed. */
  location: LocationRow | null;
  onClose: () => void;
  onArchived: () => void;
}) {
  const t = useTranslations();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CompanyFormErrorKey | null>(null);

  function close() {
    if (pending) return;
    setError(null);
    onClose();
  }

  async function archive() {
    if (!location || pending) return;
    setPending(true);
    setError(null);
    const result = await archiveLocationAction({
      locationId: location.id,
    }).catch(() => undefined);
    if (result?.data) {
      setPending(false);
      notify.success(
        t("company.locations.archived", { label: location.label }),
      );
      onArchived();
      return;
    }
    const failure = mapCompanyActionError(result);
    if (failure.kind === "unauthenticated") {
      loadPage("/login");
      return;
    }
    setPending(false);
    setError(failure.formKey);
  }

  return (
    <Dialog open={location !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent closeLabel={t("company.locations.cancel")}>
        <DialogHeader>
          <DialogTitle>
            {t("company.locations.archiveTitle", {
              label: location?.label ?? "",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("company.locations.archiveDescription")}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p
            role="alert"
            className="rounded-md bg-negative-bg p-3 text-sm text-negative-text"
          >
            {t(error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={close} disabled={pending}>
            {t("company.locations.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void archive()}
            disabled={pending}
          >
            {pending ? (
              <>
                <span
                  aria-hidden="true"
                  className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
                {t("company.locations.archiving")}
              </>
            ) : (
              t("company.locations.archiveConfirm")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
