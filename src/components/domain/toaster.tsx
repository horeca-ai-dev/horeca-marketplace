"use client";

/**
 * Toasts — for results the user cannot see where they acted (DESIGN.md → How UI talks to the server):
 *   - background or out-of-view work: "Uvoz je završen", "Link je kopiran"
 *   - the SUCCESS of a form or action whose own UI closes when it succeeds (a side panel, a dialog, an
 *     inline edit mode, a row-menu action): "Lokacija je sačuvana" (D5-A3 company pages)
 * A form's ERRORS still belong next to the form (inline field errors, ErrorSummary), never in a toast;
 * notify.error is for failures that have no form to show them next to (a row-menu action).
 *
 *   import { notify } from "@/components/domain/toaster";
 *   notify.success(t("import.done"));        // closes after 5 s
 *   notify.error(result.serverError.message); // stays until dismissed (DESIGN.md: errors persist)
 *
 * `notify` writes to a tiny in-memory store; <Toaster /> (mounted once in the root layout) renders
 * it. Client-side only: a Server Component cannot raise a toast — it renders its result instead.
 */
import { useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, Info, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastViewport,
  type ToastTone,
} from "@/components/ui/toast";

type Item = { id: number; tone: ToastTone; message: string };

const SUCCESS_MS = 5000;
/** At most this many at once; the oldest goes first. */
const MAX = 3;

let items: Item[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(next: Item[]) {
  items = next;
  for (const listener of listeners) listener();
}

function push(tone: ToastTone, message: string) {
  emit([...items, { id: nextId++, tone, message }].slice(-MAX));
}

function dismiss(id: number) {
  emit(items.filter((item) => item.id !== id));
}

export const notify = {
  success: (message: string) => push("success", message),
  info: (message: string) => push("info", message),
  error: (message: string) => push("error", message),
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const EMPTY: Item[] = [];

const ICONS: Record<ToastTone, LucideIcon> = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
};

export function Toaster() {
  const t = useTranslations("toast");
  const current = useSyncExternalStore(
    subscribe,
    () => items,
    () => EMPTY,
  );
  return (
    <ToastProvider duration={SUCCESS_MS}>
      {current.map((item) => (
        <Toast
          key={item.id}
          tone={item.tone}
          // Errors stay until dismissed and interrupt the screen reader; the rest wait politely.
          duration={item.tone === "error" ? Infinity : undefined}
          type={item.tone === "error" ? "foreground" : "background"}
          onOpenChange={(open) => {
            if (!open) dismiss(item.id);
          }}
        >
          <Icon icon={ICONS[item.tone]} className="mt-0.5" />
          <ToastDescription>{item.message}</ToastDescription>
          <ToastClose label={t("close")} />
        </Toast>
      ))}
      {/* Radix fills in {hotkey} itself, so it is passed through literally. */}
      <ToastViewport label={t("region", { hotkey: "{hotkey}" })} />
    </ToastProvider>
  );
}
