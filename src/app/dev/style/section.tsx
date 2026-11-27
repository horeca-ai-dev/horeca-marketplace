/** One titled block of the /dev/style specimen sheet. */
import type { ReactNode } from "react";

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border py-8">
      <h2 className="text-xl">{title}</h2>
      {note ? (
        <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
          {note}
        </p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
