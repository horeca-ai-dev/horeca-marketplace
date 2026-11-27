/**
 * Table state lives in the URL (DESIGN.md → How UI talks to the server): a sorted, paged list with an
 * open row is a shareable link, and the Server Component page reads the same parameters to query.
 *
 *   ?sort=<column key>&dir=asc|desc   ?page=<n> (1-based)   ?open=<row id>
 *
 * Pure functions over the current query string: every link keeps the parameters it does not own
 * (filters, search). Changing the sort goes back to page 1; opening or closing a row keeps the page.
 */
export const TABLE_PARAMS = {
  sort: "sort",
  dir: "dir",
  page: "page",
  open: "open",
} as const;

export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir } | null;

type Query = string | URLSearchParams;

function withParams(
  pathname: string,
  query: Query,
  change: (params: URLSearchParams) => void,
): string {
  const params = new URLSearchParams(query);
  change(params);
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

/** The sort the URL asks for, or null. The page must still check `key` against its own allow-list. */
export function readSort(query: Query): SortState {
  const params = new URLSearchParams(query);
  const key = params.get(TABLE_PARAMS.sort);
  if (!key) return null;
  return {
    key,
    dir: params.get(TABLE_PARAMS.dir) === "desc" ? "desc" : "asc",
  };
}

/** Click on a column header: first ascending, then descending, then ascending again. */
export function sortHref(pathname: string, query: Query, key: string): string {
  const current = readSort(query);
  const dir: SortDir =
    current?.key === key && current.dir === "asc" ? "desc" : "asc";
  return withParams(pathname, query, (p) => {
    p.set(TABLE_PARAMS.sort, key);
    p.set(TABLE_PARAMS.dir, dir);
    p.delete(TABLE_PARAMS.page);
    p.delete(TABLE_PARAMS.open);
  });
}

/** A page link; page 1 is the URL without `page`. */
export function pageHref(pathname: string, query: Query, page: number): string {
  return withParams(pathname, query, (p) => {
    if (page <= 1) p.delete(TABLE_PARAMS.page);
    else p.set(TABLE_PARAMS.page, String(page));
    p.delete(TABLE_PARAMS.open);
  });
}

export function openHref(
  pathname: string,
  query: Query,
  rowId: string,
): string {
  return withParams(pathname, query, (p) => p.set(TABLE_PARAMS.open, rowId));
}

export function closeHref(pathname: string, query: Query): string {
  return withParams(pathname, query, (p) => p.delete(TABLE_PARAMS.open));
}
