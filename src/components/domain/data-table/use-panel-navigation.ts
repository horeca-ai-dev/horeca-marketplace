"use client";

/**
 * Opens and closes the side panel (`?open=<id>`) with the history rules of panel-history.ts:
 * opening pushes ONE entry, switching rows replaces it, closing goes Back to the list — or, on a page
 * loaded with ?open= (nothing of ours to go back to), replaces the URL.
 *
 *   const panel = usePanelNavigation();
 *   <Link {...panel.linkProps(row.id)}>…</Link>      a row's link (keyboard and middle-click work)
 *   panel.open(row.id)                               the same from a click handler
 *   panel.close()                                    Esc / ✕ (SidePanel does this)
 *   panel.close({ refresh: true })                   after a save: the list must show the new data
 *
 * Why the refresh: Back restores the list from the router cache — the data from BEFORE the save.
 * A refresh right after router.back() could run against the old URL, so it waits for the popstate.
 */
import type { MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  afterOpen,
  closeMode,
  openMode,
  type OpenMode,
  type PanelEntry,
} from "./panel-history";
import { TABLE_PARAMS, closeHref, openHref } from "./table-url";

/**
 * The entry we pushed. Module state on purpose: it survives client-side navigation between the list
 * and its panel, and is gone after a reload or on a direct link — when there is no entry of ours.
 */
let ourEntry: PanelEntry = null;

/** Ctrl / ⌘ / Shift / middle click opens a new tab or window: nothing happens in this history. */
function isPlainClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function usePanelNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const openId = new URLSearchParams(query).get(TABLE_PARAMS.open);
  const currentUrl = query ? `${pathname}?${query}` : pathname;

  const target = (id: string): { href: string; mode: OpenMode } => ({
    href: openHref(pathname, query, id),
    mode: openMode(openId),
  });

  return {
    openId,

    linkProps(id: string) {
      const { href, mode } = target(id);
      return {
        href,
        replace: mode === "replace",
        scroll: false,
        onClick: (event: MouseEvent) => {
          if (isPlainClick(event)) ourEntry = afterOpen(ourEntry, mode, href);
        },
      };
    },

    open(id: string) {
      const { href, mode } = target(id);
      ourEntry = afterOpen(ourEntry, mode, href);
      if (mode === "push") router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },

    close({ refresh = false }: { refresh?: boolean } = {}) {
      const mode = closeMode(ourEntry, currentUrl);
      ourEntry = null;
      if (mode === "back") {
        if (refresh) {
          window.addEventListener("popstate", () => router.refresh(), {
            once: true,
          });
        }
        router.back();
      } else {
        // A new URL: the page is rendered again from the server, so no refresh is needed.
        router.replace(closeHref(pathname, query), { scroll: false });
      }
    },
  };
}
