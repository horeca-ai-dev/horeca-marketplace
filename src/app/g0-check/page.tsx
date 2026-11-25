/**
 * THROWAWAY (G0 check) — /g0-check. Delete this folder, src/server/domain/g0-ping.ts and the
 * "g0.ping" policy after gate G0.
 *
 * What a working G0 looks like after clicking the button:
 *   data.login   = "horeca_app"   (the app never connects as the owner)
 *   data.orgId   = your organization's id   (RLS context was set by withTx)
 *   data.role    = "owner" / "member"
 * Logged out, the action must answer serverError.code = "UNAUTHENTICATED".
 * From another origin it must be refused by Next (serverActions.allowedOrigins in next.config.ts).
 */
import { resolveSession } from "@/server/auth/actor";
import { PingButton } from "./ping-button";

export default async function G0CheckPage() {
  const state = await resolveSession();
  return (
    <main style={{ padding: 24, fontFamily: "monospace" }}>
      <h1>G0 check</h1>
      <p>
        Session:{" "}
        {state.kind === "actor"
          ? `${state.actor.orgType} ${state.actor.role} of ${state.actor.orgId}`
          : state.kind}
      </p>
      <PingButton />
    </main>
  );
}
