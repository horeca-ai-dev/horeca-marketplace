"use client";

/**
 * Preview only: the tile's add button that turns into a quantity stepper once tapped
 * (DESIGN.md → Shopping mode). The real one is QuantityStepper + a cart action (D8).
 */
import { useState } from "react";

const control =
  "inline-flex h-(--control-h) items-center justify-center rounded-md border border-input bg-background text-sm font-semibold text-foreground transition-colors hover:bg-surface disabled:opacity-50";

export function TileAdd({ disabled = false }: { disabled?: boolean }) {
  const [qty, setQty] = useState(0);

  if (qty === 0) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setQty(1)}
        className={`${control} w-full px-4`}
      >
        Dodajte
      </button>
    );
  }

  return (
    <div className="flex w-full items-center gap-2">
      <button
        type="button"
        aria-label="Smanjite količinu"
        onClick={() => setQty(qty - 1)}
        className={`${control} w-(--control-h) shrink-0`}
      >
        −
      </button>
      <output
        aria-live="polite"
        aria-label="Količina u korpi"
        className="flex-1 text-center text-sm font-medium tabular-nums"
      >
        {qty} kom
      </output>
      <button
        type="button"
        aria-label="Povećajte količinu"
        onClick={() => setQty(qty + 1)}
        className={`${control} w-(--control-h) shrink-0`}
      >
        +
      </button>
    </div>
  );
}
