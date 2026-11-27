"use client";

/**
 * Toast primitives (Radix Toast on our tokens — DESIGN.md → Components, "Toast / Alert"): success,
 * error and info in the badge tones (tone text on tone tint — allowed contrast pairs), the one
 * floating shadow, a fade (nothing slides or scales). Radix makes the viewport a labelled region
 * (F8 jumps to it), pauses timers on hover / focus, and announces each toast.
 *
 * Screens do not use these directly: they call `notify` (src/components/domain/toaster.tsx).
 */
import type { ComponentProps } from "react";
import { X } from "lucide-react";
import { Toast as ToastPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";
import { Icon } from "./icon";

const ToastProvider = ToastPrimitive.Provider;

function ToastViewport({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "fixed right-0 bottom-0 z-[60] flex w-full flex-col gap-2 p-4 md:max-w-sm",
        className,
      )}
      {...props}
    />
  );
}

const TOAST_TONES = {
  success: "bg-positive-bg text-positive-text",
  error: "bg-negative-bg text-negative-text",
  info: "bg-neutral-bg text-neutral-text",
} as const;
export type ToastTone = keyof typeof TOAST_TONES;

function Toast({
  className,
  tone,
  ...props
}: ComponentProps<typeof ToastPrimitive.Root> & { tone: ToastTone }) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      data-tone={tone}
      className={cn(
        "relative flex items-start gap-3 rounded-md p-4 pr-12 text-sm shadow-float duration-200 ease-out data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        TOAST_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

function ToastDescription({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Description>) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("font-medium", className)}
      {...props}
    />
  );
}

/** Close button; `label` is its accessible name (components/ui holds no texts). */
function ToastClose({
  className,
  label,
  ...props
}: ComponentProps<typeof ToastPrimitive.Close> & { label: string }) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label={label}
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "absolute top-1 right-1 text-current hover:bg-transparent",
        className,
      )}
      {...props}
    >
      <Icon icon={X} />
    </ToastPrimitive.Close>
  );
}

export { ToastProvider, ToastViewport, Toast, ToastDescription, ToastClose };
