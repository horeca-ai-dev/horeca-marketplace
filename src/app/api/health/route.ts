/**
 * GET /api/health (D2-A4) — one of the allowed route handlers (CLAUDE.md rule 5). No login: the deploy
 * script and Docker healthchecks call it.
 *
 *   200  PostgreSQL reachable AND migrations at the version bundled in this image
 *        (body status "ok", or "degraded" when Meilisearch / Mailpit / the worker are not healthy)
 *   503  database down or migrations behind / ahead → the deploy stops before switching traffic
 *
 * The body holds states only (see src/server/health.ts).
 */
import { healthReport } from "@/server/health";

export async function GET() {
  const report = await healthReport();
  return Response.json(report, {
    status: report.status === "down" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
