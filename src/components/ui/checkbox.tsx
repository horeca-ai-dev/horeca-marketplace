"use client";

/**
 * Checkbox (shadcn/ui source on our tokens; Radix Checkbox underneath: Space toggles). Uses:
 * catalogue supplier / attribute filters, "default location".
 *
 * 20 px box with the `--input` border (3:1 for controls); checked = solid primary with a white tick.
 * The 44-px touch target comes from the <label> around it — always pair it with a visible label.
 */
import type { ComponentProps } from "react";
import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

function Checkbox({
  className,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md border border-input bg-background transition-colors disabled:opacity-50 aria-invalid:border-negative-text data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator">
        <Icon icon={Check} size={16} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
