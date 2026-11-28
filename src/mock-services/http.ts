/**
 * The HTTP server of mock-services (D6-A3) on Node's built-in `http` module — a handful of routes
 * does not need a framework.
 *
 *   GET  /health                       no key — the container healthcheck
 *   GET  /suppliers/{code}/stock       supplier API key   (src/mock-services/supplier-api.ts)
 *   POST /suppliers/{code}/orders      supplier API key
 *   *    /gateway/…                    reserved for the card gateway (D10-B3, src/mock-services/gateway.ts)
 *
 * mock-services plays EXTERNAL systems: it has no database connection and imports nothing from our
 * domain or database layers (ESLint enforces it).
 */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { Logger } from "@/server/logger";
import { isAuthorized } from "./auth";
import { handleGateway } from "./gateway";
import { json, problem, type ApiResponse } from "./response";
import { getStock, postOrder, type SupplierApiDeps } from "./supplier-api";

export const MAX_BODY_BYTES = 64 * 1024;

export type MockServerOptions = SupplierApiDeps & {
  supplierApiKey: string;
  log: Logger;
};

class BodyTooLarge extends Error {}

/**
 * Event-based on purpose: leaving a `for await` early DESTROYS the request and its socket, and then
 * the 413 answer could never be sent.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    if (Number(req.headers["content-length"] ?? 0) > MAX_BODY_BYTES) {
      reject(new BodyTooLarge());
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Stop keeping the data; whatever still arrives is discarded until the answer closes the connection.
        req.off("data", onData);
        req.resume();
        reject(new BodyTooLarge());
        return;
      }
      chunks.push(chunk);
    };
    req.on("data", onData);
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function methodNotAllowed(allow: string): ApiResponse {
  return problem(405, "Method not allowed", undefined, {
    headers: { Allow: allow },
  });
}

async function route(
  options: MockServerOptions,
  req: IncomingMessage,
  pathname: string,
  query: URLSearchParams,
): Promise<ApiResponse> {
  const method = req.method ?? "GET";

  if (pathname === "/health")
    return method === "GET"
      ? json(200, { status: "ok" })
      : methodNotAllowed("GET");

  if (pathname === "/gateway" || pathname.startsWith("/gateway/"))
    return handleGateway();

  const match = /^\/suppliers\/([^/]+)\/(stock|orders)$/.exec(pathname);
  if (!match) return problem(404, "Not found");

  // The key is checked before anything about the request is revealed (valid code, behaviour, input).
  if (!isAuthorized(req.headers.authorization, options.supplierApiKey))
    return problem(401, "Unauthorized", undefined, {
      headers: { "WWW-Authenticate": "Bearer" },
    });

  let supplier: string;
  try {
    supplier = decodeURIComponent(match[1]!);
  } catch {
    return problem(404, "Not found");
  }

  if (match[2] === "stock")
    return method === "GET"
      ? getStock(options, supplier, query.get("skus"))
      : methodNotAllowed("GET");

  if (method !== "POST") return methodNotAllowed("POST");
  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    if (err instanceof BodyTooLarge)
      // The rest of the body is not read: close the connection after answering.
      return problem(413, "Payload too large", undefined, {
        headers: { Connection: "close" },
      });
    return problem(400, "Bad request", "The body is not valid JSON.");
  }
  return postOrder(options, supplier, body);
}

function send(res: ServerResponse, response: ApiResponse): void {
  const payload = JSON.stringify(response.body);
  res.writeHead(response.status, {
    "Content-Type": `${response.contentType}; charset=utf-8`,
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...response.headers,
  });
  res.end(payload);
}

/** Builds the server; the caller listens (the entry point on 4010, tests on a random port). */
export function createMockServer(options: MockServerOptions): Server {
  return createServer((req, res) => {
    const started = performance.now();
    // Only the path is ever logged: never headers (the API key) and never bodies.
    let pathname = "";
    void (async () => {
      let response: ApiResponse;
      try {
        const url = new URL(req.url ?? "/", "http://mock-services");
        pathname = url.pathname;
        response = await route(options, req, pathname, url.searchParams);
      } catch (err: unknown) {
        options.log.error({ err }, "unexpected error");
        response = problem(500, "Internal server error");
      }
      send(res, response);
      const line = {
        method: req.method,
        path: pathname,
        status: response.status,
        ms: Math.round(performance.now() - started),
      };
      // The healthcheck runs every few seconds: keep it out of the normal log.
      if (pathname === "/health") options.log.debug(line, "request");
      else options.log.info(line, "request");
    })();
  });
}
