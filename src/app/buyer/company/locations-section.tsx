"use client";

/**
 * Delivery locations on /buyer/company (D5-A3; matrix: buyerLocation.* — every buyer member, owner
 * or not; there is no owner-only rule for locations).
 *
 * All state is in the URL, like every table (DESIGN.md → How UI talks to the server):
 *   ?archived=1     the archived locations are listed too (the page passes includeArchived)
 *   ?open=new       the side panel with an empty form
 *   ?open=<id>      the side panel with that location's form (an archived one: read-only note)
 * Saving closes the panel (removing ?open= re-renders the page with fresh data); the menu actions
 * stay on the page and call router.refresh().
 *
 * "Postavite kao podrazumijevanu" in the row menu sends the row's fields again with makeDefault —
 * the update replaces every field, so a change someone else saved to this location in the meantime is
 * overwritten (last write wins). Accepted for the MVP: locations are rarely edited by two people at
 * once, and the fields sent are the ones the user sees in the row.
 */
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/domain/data-table/data-table";
import { dataTableColumns } from "@/components/domain/data-table/columns";
import { SidePanel } from "@/components/domain/data-table/side-panel";
import { closeHref, openHref } from "@/components/domain/data-table/table-url";
import { EmptyState } from "@/components/domain/empty-state";
import { ToneBadge } from "@/components/domain/status-badge/tone-badge";
import { notify } from "@/components/domain/toaster";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { loadPage } from "@/lib/auth/load-page";
import { mapCompanyActionError } from "@/lib/company/form-errors";
import { updateLocationAction } from "@/server/actions/company";
import { ArchiveLocationDialog } from "./archive-location-dialog";
import { LocationForm } from "./location-form";
import { locationFields, type LocationRow } from "./location-row";

const NEW = "new";
const ARCHIVED_PARAM = "archived";

export function LocationsSection({
  locations,
  includeArchived,
}: {
  locations: LocationRow[];
  includeArchived: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const openId = new URLSearchParams(query).get("open");
  const [toArchive, setToArchive] = useState<LocationRow | null>(null);

  const closePanel = () =>
    router.push(closeHref(pathname, query), { scroll: false });

  const archivedToggle = (() => {
    const params = new URLSearchParams(query);
    params.delete("open");
    if (includeArchived) params.delete(ARCHIVED_PARAM);
    else params.set(ARCHIVED_PARAM, "1");
    const search = params.toString();
    return search ? `${pathname}?${search}` : pathname;
  })();

  async function makeDefault(row: LocationRow) {
    const result = await updateLocationAction({
      locationId: row.id,
      ...locationFields(row),
      makeDefault: true,
    }).catch(() => undefined);
    if (result?.data) {
      notify.success(
        t("company.locations.madeDefault", { label: result.data.label }),
      );
      router.refresh();
      return;
    }
    const failure = mapCompanyActionError(result);
    if (failure.kind === "unauthenticated") loadPage("/login");
    // Errors stay until dismissed (DESIGN.md); there is no form to show this next to.
    else notify.error(t(failure.formKey));
  }

  const col = dataTableColumns<LocationRow>();
  const columns = col.columns([
    col.accessor("label", {
      header: t("company.locations.columns.label"),
      meta: { mobile: "title" },
    }),
    col.display({
      id: "address",
      header: t("company.locations.columns.address"),
      cell: ({ row }) =>
        `${row.original.addressLine}, ${row.original.postalCode} ${row.original.city}`,
      meta: { mobile: "meta" },
    }),
    col.display({
      id: "contact",
      header: t("company.locations.columns.contact"),
      cell: ({ row }) =>
        [row.original.contactName, row.original.contactPhone]
          .filter(Boolean)
          .join(" · "),
      meta: { mobile: "hidden" },
    }),
    col.display({
      id: "state",
      header: t("company.locations.columns.status"),
      cell: ({ row }) =>
        row.original.archived ? (
          <ToneBadge tone="neutral">
            {t("company.locations.badge.archived")}
          </ToneBadge>
        ) : row.original.isDefault ? (
          <ToneBadge tone="positive">
            {t("company.locations.badge.default")}
          </ToneBadge>
        ) : null,
      meta: { mobile: "meta" },
    }),
  ]);

  const addButton = (
    <Button asChild variant="secondary">
      <Link href={openHref(pathname, query, NEW)} scroll={false}>
        {t("company.locations.add")}
      </Link>
    </Button>
  );

  const open =
    openId === NEW
      ? { kind: "new" as const }
      : locations.find((l) => l.id === openId);

  return (
    <section
      aria-labelledby="locations-heading"
      className="mt-8 flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="locations-heading" className="text-xl">
          {t("company.locations.heading")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost">
            <Link href={archivedToggle} scroll={false}>
              {includeArchived
                ? t("company.locations.hideArchived")
                : t("company.locations.showArchived")}
            </Link>
          </Button>
          {/* With no locations the empty state offers the same action. */}
          {locations.length > 0 ? addButton : null}
        </div>
      </div>

      <DataTable
        caption={t("company.locations.heading")}
        columns={columns}
        data={locations}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.label}
        density="comfortable"
        openable
        rowAction={(row) =>
          row.archived ? null : (
            <Button asChild variant="ghost">
              <Link href={openHref(pathname, query, row.id)} scroll={false}>
                {t("company.locations.editAction")}
              </Link>
            </Button>
          )
        }
        rowMenu={(row) =>
          row.archived ? null : (
            <>
              {row.isDefault ? null : (
                <DropdownMenuItem onSelect={() => void makeDefault(row)}>
                  {t("company.locations.makeDefault")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setToArchive(row)}>
                {t("company.locations.archive")}
              </DropdownMenuItem>
            </>
          )
        }
        empty={
          <EmptyState
            message={t("company.locations.empty")}
            action={addButton}
          />
        }
      />

      {open && openId ? (
        <SidePanel
          title={
            "kind" in open
              ? t("company.locations.addTitle")
              : t("company.locations.editTitle")
          }
          rowId={openId}
        >
          {"kind" in open ? (
            <LocationForm key={NEW} onSaved={closePanel} />
          ) : open.archived ? (
            <p className="text-base">{t("company.locations.archivedNote")}</p>
          ) : (
            <LocationForm key={open.id} location={open} onSaved={closePanel} />
          )}
        </SidePanel>
      ) : null}

      <ArchiveLocationDialog
        location={toArchive}
        onClose={() => setToArchive(null)}
        onArchived={() => {
          setToArchive(null);
          router.refresh();
        }}
      />
    </section>
  );
}
