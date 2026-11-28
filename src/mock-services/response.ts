/** What a handler returns; src/mock-services/http.ts writes it to the socket. */
export type ApiResponse = {
  status: number;
  body: unknown;
  contentType: "application/json" | "application/problem+json";
  headers?: Record<string, string>;
};

export function json(status: number, body: unknown): ApiResponse {
  return { status, body, contentType: "application/json" };
}

/** RFC 9457 problem details, like our own route handlers. */
export function problem(
  status: number,
  title: string,
  detail?: string,
  extra?: { errors?: unknown; headers?: Record<string, string> },
): ApiResponse {
  return {
    status,
    contentType: "application/problem+json",
    headers: extra?.headers,
    body: {
      type: "about:blank",
      title,
      status,
      ...(detail === undefined ? {} : { detail }),
      ...(extra?.errors === undefined ? {} : { errors: extra.errors }),
    },
  };
}
