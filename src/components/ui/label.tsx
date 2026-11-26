/**
 * Label (DESIGN.md → Components): always above its control, 14 px medium. A plain <label> — clicking
 * it focuses the control named by `htmlFor`.
 */
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}

export { Label };
