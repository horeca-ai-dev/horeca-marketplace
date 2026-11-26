/**
 * Input (shadcn/ui source, rewritten onto our tokens — DESIGN.md → Components).
 * Control height (--control-h: 40 px, 44 px on touch), 6 px radius, `--input` border (3.61:1 on
 * white). An invalid field gets the error colour on its border; the error itself is always text
 * next to it (never colour only). The focus ring is the global :focus-visible rule in globals.css.
 *
 * Use it through TextField (src/components/domain/form), which adds the label, help and error.
 */
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "h-(--control-h) w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground transition-colors disabled:opacity-50 aria-invalid:border-negative-text",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
