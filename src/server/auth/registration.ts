/**
 * Registration flows (D2-B2) — what the Server Actions of the register form call (actions: D2-B3,
 * form: D4-A3).
 *
 *   registerCompany(input)                         not logged in: account + company in one form
 *   completeCompanySetup(userId, headers, company) logged in, no organization yet
 *                                                  ("Complete company setup")
 *
 * Order (APPLIED.md): Better Auth's server API creates the user → OUR transaction creates
 * organization + member + profile → Better Auth's API sets the session's active organization.
 * If the company step fails after the user was created, the user simply has no organization yet:
 * the next login lands on "Complete company setup", which runs the same transaction.
 */
import { APIError } from "better-auth/api";
import { env } from "@/env.core";
import type {
  CompanyInput,
  RegistrationInput,
} from "@/lib/schemas/registration";
import { getAuth } from "@/server/auth/auth";
import { withUserTx } from "@/server/db/tx";
import { Conflict, Forbidden } from "@/server/domain/errors";
import {
  registerOrganization,
  type RegisteredOrganization,
} from "@/server/domain/organizations";

export async function completeCompanySetup(
  userId: string,
  requestHeaders: Headers,
  company: CompanyInput,
): Promise<RegisteredOrganization> {
  const registered = await withUserTx(userId, (tx) =>
    registerOrganization(tx, userId, company),
  );
  // After the commit: the organization exists, so Better Auth accepts it as the active one.
  await getAuth().api.setActiveOrganization({
    headers: requestHeaders,
    body: { organizationId: registered.organizationId },
  });
  return registered;
}

export async function registerCompany(
  input: RegistrationInput,
): Promise<RegisteredOrganization & { userId: string }> {
  // The HTTP sign-up endpoint checks this too (auth.ts); this is the form's path.
  if (!env.REGISTRATION_OPEN) throw new Forbidden("Registration is closed.");

  let signUp;
  try {
    signUp = await getAuth().api.signUpEmail({
      body: {
        name: input.account.name,
        email: input.account.email,
        password: input.account.password,
      },
      returnHeaders: true,
    });
  } catch (error) {
    if (
      error instanceof APIError &&
      error.body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
    ) {
      throw new Conflict(
        "An account with this e-mail already exists. Please log in.",
      );
    }
    throw error;
  }

  // The new session exists only as Set-Cookie on this response (inside a Server Action nextCookies()
  // also forwards it to the browser). Build the Cookie header the next Better Auth call needs.
  const sessionHeaders = new Headers({
    cookie: toCookieHeader(signUp.headers.getSetCookie()),
  });
  const registered = await completeCompanySetup(
    signUp.response.user.id,
    sessionHeaders,
    input.company,
  );
  return { ...registered, userId: signUp.response.user.id };
}

/** ["a=1; Path=/; HttpOnly", "b=2; …"] → "a=1; b=2" */
function toCookieHeader(setCookies: string[]): string {
  return setCookies.map((c) => c.split(";", 1)[0]).join("; ");
}
