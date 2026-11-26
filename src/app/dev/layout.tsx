/**
 * Developer-only pages under /dev (D4-A0: /dev/style, the design-token preview).
 *
 * Reachable on local and staging; production answers 404. APP_ENV is read per request —
 * connection() keeps Next from prerendering this at build time, when the one image we ship does not
 * know yet which environment it will run in (CLAUDE.md rule 14: no build-time configuration).
 */
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { env } from "@/env";

export default async function DevLayout({ children }: LayoutProps<"/dev">) {
  await connection();
  if (env.APP_ENV === "production") notFound();
  return children;
}
