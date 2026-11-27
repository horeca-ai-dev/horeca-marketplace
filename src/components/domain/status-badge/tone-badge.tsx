/**
 * The badge anatomy (DESIGN.md → Badges): 24 px high, 6 px radius, tone tint, 6 px dot, 12 px medium
 * label. No border, no icon, no hover, never a link — a badge must not look clickable. The label is
 * always text, so the status is readable without colour.
 *
 * Screens use StatusBadge; this is for the few badges that are not a status (e.g. "AI prijedlog").
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "./status-map";

const TONE_CLASSES: Record<Tone, string> = {
  positive: "bg-positive-bg text-positive-text",
  attention: "bg-attention-bg text-attention-text",
  negative: "bg-negative-bg text-negative-text",
  neutral: "bg-neutral-bg text-neutral-text",
  progress: "bg-progress-bg text-progress-text",
};

export function ToneBadge({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
