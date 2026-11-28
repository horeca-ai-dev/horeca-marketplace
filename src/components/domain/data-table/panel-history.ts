/**
 * How opening and closing the side panel (`?open=<id>`) uses the browser history — pure decisions,
 * carried out by usePanelNavigation().
 *
 *   open, no panel yet            → push      one entry: Back closes the panel (important on mobile)
 *   open, another panel is open   → replace   switching rows adds nothing to Back
 *   close (Esc, ✕, save), and the panel's entry is ours → back     the entry disappears again
 *   close, the page was LOADED with ?open=… (a shared link, a reload) → replace
 *                                 there is no entry of ours to go back to — Back would leave the page
 *
 * "Ours" is remembered as the URL we pushed (`PanelEntry`) and kept while switching rows. It lives in
 * memory only, so a reload or a direct link starts with none — exactly the case that must replace.
 */
export type PanelEntry = { url: string } | null;
export type OpenMode = "push" | "replace";
export type CloseMode = "back" | "replace";

export function openMode(currentOpenId: string | null): OpenMode {
  return currentOpenId ? "replace" : "push";
}

/** What we remember after opening `url` with `mode`. */
export function afterOpen(
  entry: PanelEntry,
  mode: OpenMode,
  url: string,
): PanelEntry {
  if (mode === "push") return { url };
  // Switching rows replaces the URL of the entry: still ours if it was ours, still none if not.
  return entry ? { url } : null;
}

/**
 * Back only when the entry on screen is the one we pushed. Anything else (no entry, or one from
 * earlier that no longer matches the URL — e.g. the user went Back and Forward meanwhile) replaces:
 * at worst one extra history entry stays, never a jump off the page.
 */
export function closeMode(entry: PanelEntry, currentUrl: string): CloseMode {
  return entry?.url === currentUrl ? "back" : "replace";
}
