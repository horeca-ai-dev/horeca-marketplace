"use client";

/**
 * Sign-out, shared by the account menu (UserMenu) and "Complete company setup" (SignOutLink).
 * Calls Better Auth's own endpoint (POST /api/auth/sign-out) through its client — no Server Action
 * of ours.
 *
 * After signing out the browser LOADS /login (a full navigation, not a client-side one), so nothing
 * rendered for the signed-in user stays in memory.
 */
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  browserDraftStorage,
  clearCompanyDraft,
} from "@/lib/auth/company-draft";

export type SignOutStatus = "idle" | "pending" | "failed";

export function useSignOut() {
  const [status, setStatus] = useState<SignOutStatus>("idle");

  async function signOut() {
    setStatus("pending");
    // A half-finished registration may have left company data in this tab (company-draft.ts):
    // it must not outlive the session, whether or not the sign-out request succeeds.
    clearCompanyDraft(browserDraftStorage());
    const { error } = await authClient.signOut().catch(() => ({ error: true }));
    if (error) {
      setStatus("failed");
      return;
    }
    // Deliberately a full page load, not router.push(): see the comment at the top.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  return { status, signOut };
}
