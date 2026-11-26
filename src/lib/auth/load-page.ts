/**
 * Leaves the current page with a FULL page load (not a client-side navigation). The auth forms use
 * it after the session changed (signed in, company created): the next page is rendered by the
 * server from the new session, and nothing rendered for the old state stays in memory.
 */
export function loadPage(path: `/${string}`): void {
  window.location.assign(path);
}
