/**
 * The top of every page: the page's one H1, an optional sentence under it, and an optional action
 * on the right (at most one solid green button per view — DESIGN.md principle 2).
 * The next section starts 32 px below.
 */
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pt-8 pb-8">
      <div className="min-w-0">
        <h1 className="text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
