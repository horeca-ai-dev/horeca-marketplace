"use client";

/**
 * Client parts of the /dev/style "Components" section (D4-A2): the DataTable demo (its columns hold
 * render functions, so they live in a Client Component — the pattern every real table follows), the
 * toast buttons and the new form primitives. Specimen texts are written out here on purpose.
 */
import { useMemo, useState } from "react";
import { DataTable } from "@/components/domain/data-table/data-table";
import { dataTableColumns } from "@/components/domain/data-table/columns";
import { EmptyState } from "@/components/domain/empty-state";
import { MoneyText } from "@/components/domain/money-text";
import type { Density } from "@/components/domain/page-skeleton";
import { StatusBadge } from "@/components/domain/status-badge/status-badge";
import type { StatusValue } from "@/components/domain/status-badge/status-map";
import { notify } from "@/components/domain/toaster";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/format";

export type DemoSubOrder = {
  id: string;
  number: string;
  buyer: string;
  placedAt: Date;
  mode: StatusValue<"purchaseMode">;
  status: StatusValue<"subOrder">;
  grossCents: bigint;
};

export function DemoSubOrdersTable({
  rows,
  loading,
  density,
  page,
}: {
  rows: DemoSubOrder[];
  loading: boolean;
  density: Density;
  page: number;
}) {
  // Stable columns (TanStack: never a new array per render).
  const columns = useMemo(() => {
    const col = dataTableColumns<DemoSubOrder>();
    return col.columns([
      col.accessor("number", {
        header: "Porudžbina",
        // Document numbers never break at their hyphens.
        cell: (c) => <span className="whitespace-nowrap">{c.getValue()}</span>,
        meta: { mobile: "title", sortKey: "number" },
      }),
      col.accessor("buyer", { header: "Kupac", meta: { sortKey: "buyer" } }),
      col.accessor("placedAt", {
        header: "Datum",
        cell: (c) => (
          <span className="tabular-nums">{formatDate(c.getValue())}</span>
        ),
        meta: { align: "end", sortKey: "placedAt" },
      }),
      col.accessor("mode", {
        header: "Način",
        cell: (c) => (
          <StatusBadge entity="purchaseMode" status={c.getValue()} />
        ),
        meta: { mobile: "meta" },
      }),
      col.accessor("status", {
        header: "Status",
        cell: (c) => <StatusBadge entity="subOrder" status={c.getValue()} />,
        meta: { mobile: "meta" },
      }),
      col.accessor("grossCents", {
        header: "Ukupno",
        cell: (c) => <MoneyText cents={c.getValue()} tabular />,
        meta: { align: "end", mobile: "meta", sortKey: "gross" },
      }),
    ]);
  }, []);

  return (
    <DataTable
      caption="Podporudžbine (primjer)"
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      rowLabel={(r) => r.number}
      density={density}
      openable
      loading={loading}
      pagination={{ page, pageCount: 3 }}
      rowAction={(r) =>
        r.status === "pending" ? (
          <Button
            variant="ghost"
            onClick={() => notify.success(`${r.number} je potvrđena.`)}
          >
            Potvrdite
          </Button>
        ) : null
      }
      rowMenu={(r) => (
        <>
          <DropdownMenuItem
            onSelect={() => notify.info(`${r.number}: istorija`)}
          >
            Istorija
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => notify.error(`${r.number} nije moguće otkazati.`)}
          >
            Otkažite
          </DropdownMenuItem>
        </>
      )}
      empty={
        <EmptyState
          message="Još nemate porudžbina. Pojaviće se ovdje čim kupac naruči Vaše proizvode."
          action={
            <Button asChild variant="primary">
              <a href="/dev/style">Otvorite proizvode</a>
            </Button>
          }
        />
      }
    />
  );
}

export function ToastButtons() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => notify.success("Uvoz je završen: 112 proizvoda.")}>
        Uspjeh
      </Button>
      <Button onClick={() => notify.info("Link je kopiran.")}>Info</Button>
      <Button
        onClick={() =>
          notify.error("Slanje dobavljaču nije uspjelo. Pokušaćemo ponovo.")
        }
      >
        Greška (ostaje)
      </Button>
    </div>
  );
}

export function FormPrimitives() {
  const [location, setLocation] = useState("");
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="demo-location">Lokacija isporuke</Label>
        <Select value={location} onValueChange={setLocation}>
          <SelectTrigger id="demo-location">
            <SelectValue placeholder="Izaberite lokaciju" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="budva">Hotel Primorje — Budva</SelectItem>
            <SelectItem value="kotor">Restoran Stari grad — Kotor</SelectItem>
            <SelectItem value="pg">Kafić Centar — Podgorica</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Dobavljači</legend>
        {["Mesnica Durmitor d.o.o.", "Voćar Zeta d.o.o."].map((name, i) => (
          <label
            key={name}
            className="flex min-h-(--control-h) items-center gap-3 text-base"
          >
            <Checkbox defaultChecked={i === 0} />
            {name}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Način kupovine</legend>
        <RadioGroup defaultValue="platform">
          {[
            ["platform", "Platite odmah karticom"],
            ["direct", "Dobavljač Vam fakturiše direktno"],
          ].map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-(--control-h) items-center gap-3 text-base"
            >
              <RadioGroupItem value={value} />
              {label}
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      <div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>Uklonite lokaciju</Button>
          </DialogTrigger>
          <DialogContent closeLabel="Zatvorite">
            <DialogHeader>
              <DialogTitle>Ukloniti lokaciju „Kafić Centar“?</DialogTitle>
              <DialogDescription>
                Postojeće porudžbine zadržavaju adresu. Novu porudžbinu na ovu
                lokaciju više nećete moći da pošaljete.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button>Odustanite</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="destructive">Uklonite</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
