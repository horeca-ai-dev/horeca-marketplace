/**
 * The one way to render an icon (DESIGN.md → Icons): lucide outline icons, stroke 1.5 px,
 * sizes 16 / 20 / 24, colour inherited from the text. Icons are decorative — the text or the
 * control's aria-label carries the meaning — so they are hidden from screen readers.
 */
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type IconProps = {
  icon: LucideIcon;
  size?: 16 | 20 | 24;
  className?: string;
};

export function Icon({ icon: Glyph, size = 20, className }: IconProps) {
  return (
    <Glyph
      size={size}
      strokeWidth={1.5}
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    />
  );
}
