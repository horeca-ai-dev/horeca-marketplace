/**
 * Button (shadcn/ui source, rewritten onto our tokens — DESIGN.md → Components).
 * Four variants, one height (--control-h: 40 px, 44 px on touch), 14 px semibold. Hover changes
 * colour only. The focus ring is the global :focus-visible rule in globals.css.
 *
 * `primary` is the solid green button: at most ONE per view.
 */
import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-(--control-h) shrink-0 items-center justify-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary:
          "border border-input bg-background text-foreground hover:bg-surface",
        ghost: "text-primary hover:bg-surface",
        destructive:
          "bg-destructive text-primary-foreground hover:bg-destructive-hover",
      },
      size: {
        default: "px-4",
        /** Square, for a single icon — always give it an aria-label. */
        icon: "w-(--control-h)",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a Link) with the button's look instead of a <button>. */
    asChild?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
