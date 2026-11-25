/**
 * next-safe-action clients (D2-B3, CLAUDE.md rule 4) — every Server Action is built from one of these.
 *
 *   actorAction.inputSchema(zodSchema).action(async ({ parsedInput, ctx: { actor } }) =>
 *     withTx(actor, (tx) => someDomainFunction(tx, actor, parsedInput)))
 *
 * Order for every write: Zod validates the input → middleware resolves the actor from the session →
 * the action opens withTx() → a domain function does the work. Actions contain no business logic.
 *
 * What the form receives (the result of calling the action) — rule 16:
 *   { data }                                            success
 *   { validationErrors: { formErrors, fieldErrors } }   Zod rejected the input (422)
 *   { serverError: { ok: false, code, message, fieldErrors? } }
 *                                                       a DomainError, or INTERNAL for anything else
 */
import "server-only";
import { createSafeActionClient } from "next-safe-action";
import { resolveActor } from "@/server/auth/actor";
import { getLogger } from "@/server/logger";
import {
  DomainError,
  Validation,
  type FieldErrors,
} from "@/server/domain/errors";

const log = getLogger("action");

export type ActionError = {
  ok: false;
  code: DomainError["code"] | "INTERNAL";
  message: string;
  fieldErrors?: FieldErrors;
};

export const actionClient = createSafeActionClient({
  defaultValidationErrorsShape: "flattened",
  handleServerError(error): ActionError {
    if (error instanceof Validation) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }
    if (error instanceof DomainError)
      return { ok: false, code: error.code, message: error.message };
    // Unknown error: log it on the server; tell the user nothing internal.
    log.error({ err: error }, "unexpected error");
    return {
      ok: false,
      code: "INTERNAL",
      message: "Something went wrong. Please try again.",
    };
  },
});

/** For every action that needs a logged-in user with an organization (almost all of them). */
export const actorAction = actionClient.use(async ({ next }) => {
  const actor = await resolveActor(); // throws Unauthenticated → serverError { code: "UNAUTHENTICATED" }
  return next({ ctx: { actor } });
});
