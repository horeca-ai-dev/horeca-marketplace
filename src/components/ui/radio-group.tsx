"use client";

/**
 * Radio group (shadcn/ui source on our tokens; Radix RadioGroup underneath: arrow keys move and
 * select, Tab leaves the group). Use: the purchase-mode choice per supplier group in the cart.
 *
 * The circle (a full circle is the one allowed exception to the 6 px radius) has the `--input`
 * border; selected = a primary dot. The option card around it (title + consequence sentence,
 * `--selected` tint when chosen) belongs to the domain component (CartSupplierGroup), not here.
 */
import type { ComponentProps } from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function RadioGroup({
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border border-input bg-background transition-colors disabled:opacity-50 data-[state=checked]:border-primary",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="size-2.5 rounded-full bg-primary"
      />
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
