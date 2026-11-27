/**
 * The calm page shown when something stops a screen (DESIGN.md → States, "Error"): what happened,
 * in one heading and one sentence, and ONE next action. Never a stack trace, never an internal ID.
 *
 * Inside an area it sits in the AppShell's content column, so header and navigation stay usable.
 * `standalone` adds the minimal frame of the public pages (app name, centred column) for the root
 * not-found / error pages, which render outside any area. Texts come from the caller (catalogue).
 */
import type { ReactNode } from "react";

export function ErrorPage({
  title,
  message,
  action,
  standalone = false,
  appName,
}: {
  title: string;
  message: string;
  action: ReactNode;
  standalone?: boolean;
  /** Shown in the standalone frame's header. */
  appName?: string;
}) {
  const body = (
    <div className="flex flex-col items-start gap-6 pt-8">
      <div>
        <h1 className="text-2xl">{title}</h1>
        <p className="mt-1 max-w-[70ch] text-base text-muted-foreground">
          {message}
        </p>
      </div>
      {action}
    </div>
  );
  if (!standalone) return body;
  return (
    <>
      <header className="border-b border-border">
        <div className="flex h-14 items-center px-4 md:px-8">
          <p className="text-base font-semibold">{appName}</p>
        </div>
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 pb-12">
        <div className="w-full max-w-[560px]">{body}</div>
      </main>
    </>
  );
}
