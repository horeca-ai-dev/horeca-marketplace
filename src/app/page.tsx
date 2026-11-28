/**
 * "/" has no content of its own: everyone is sent where they belong (destinationFor) —
 * not logged in → /login, logged in without a company → /complete-setup, otherwise their area.
 */
import { redirect } from "next/navigation";
import { destinationFor } from "@/lib/auth/destination";
import { resolveSession } from "@/server/auth/actor";

export default async function Home() {
  redirect(destinationFor(await resolveSession()));
}
