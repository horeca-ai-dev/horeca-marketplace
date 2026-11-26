"use server";
/**
 * Server Actions for the register form and "Complete company setup" (D2-B3; form: D4-A3).
 * The logic is in src/server/auth/registration.ts (D2-B2); these only validate and resolve who calls.
 *
 * Registration is for buyers only (decision 012). On success they return the organization's type and
 * status (always buyer / approved for now); never internal ids. The session cookie is already set
 * (nextCookies), so the form only redirects.
 */
import { headers } from "next/headers";
import { companySchema, registrationSchema } from "@/lib/schemas/registration";
import { actionClient } from "@/server/actions/safe-action";
import { resolveSession } from "@/server/auth/actor";
import {
  completeCompanySetup,
  registerCompany,
} from "@/server/auth/registration";
import { Conflict, Unauthenticated } from "@/server/domain/errors";

/** Not logged in: account + company in one form. */
export const registerCompanyAction = actionClient
  .inputSchema(registrationSchema)
  .action(async ({ parsedInput }) => {
    const { type, status } = await registerCompany(parsedInput);
    return { type, status };
  });

/** Logged in without an organization ("Complete company setup"). */
export const completeCompanySetupAction = actionClient
  .inputSchema(companySchema)
  .action(async ({ parsedInput }) => {
    const state = await resolveSession();
    if (state.kind === "anonymous") throw new Unauthenticated();
    if (state.kind === "actor")
      throw new Conflict("This account already belongs to a company.", {
        reason: "ALREADY_HAS_COMPANY",
      });
    const { type, status } = await completeCompanySetup(
      state.userId,
      await headers(),
      parsedInput,
    );
    return { type, status };
  });
