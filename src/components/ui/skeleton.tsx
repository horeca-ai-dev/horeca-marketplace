/**
 * Skeleton (DESIGN.md → States, "Loading"): a `--well` block with the exact size of the content it
 * replaces, so nothing shifts when data arrives. It does not pulse — DESIGN.md: nothing animates by
 * itself except a spinner in a pending button. Screen readers skip it; the region that is loading
 * carries `aria-busy` instead.
 */
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rounded-md bg-well", className)}
      {...props}
    />
  );
}

export { Skeleton };
