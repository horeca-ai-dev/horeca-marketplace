/**
 * requireArea() — the route guard of the /buyer, /supplier and /admin layouts (D5-A2). Carries out
 * guardArea()'s decision with Next.js' redirect() / notFound().
 *
 * notFound() thrown by a layout is answered by the ROOT not-found page (the area's own not-found.tsx
 * sits inside the layout), so a wrong area never renders the other area's shell.
 *
 * A layout is not re-rendered on client-side navigation inside its own area: the guard runs on the
 * first request into an area and on every full page load. That is enough because it only decides the
 * shell — pages and actions authorize through resolveActor() and the domain policy (rule 6).
 */
import "server-only";
import { notFound, redirect } from "next/navigation";
import { guardArea } from "@/lib/auth/area-guard";
import type { Area } from "@/lib/auth/destination";
import { resolveSession, type SessionState } from "./actor";

export async function requireArea(
  area: Area,
): Promise<Extract<SessionState, { kind: "actor" }>> {
  const state = await resolveSession();
  const decision = guardArea(state, area);
  if (decision.kind === "redirect") redirect(decision.to);
  if (decision.kind === "not-found" || state.kind !== "actor") notFound();
  return state;
}
