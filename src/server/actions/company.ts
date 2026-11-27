"use server";
/**
 * Server Actions of the company pages (D5-B4, issue #65; pages: D5-A3).
 *
 * Writes only — reads (profile, locations, bank details) are Server Components calling the domain functions
 * inside `withTx(actor)` (rule 4). An action contains no business logic: validate (Zod, in `actorAction`),
 * resolve the actor from the session, open the transaction, call the domain function. The organization is
 * the actor's; nothing in the input can name another one.
 *
 * Errors reach the form as `{ serverError: { code, message, fieldErrors?, reason? } }` (safe-action.ts).
 */
import {
  archiveLocationSchema,
  createLocationSchema,
  updateBankDetailsSchema,
  updateLocationSchema,
  updateOrgProfileSchema,
} from "@/lib/schemas/company";
import { actorAction } from "@/server/actions/safe-action";
import { withTx } from "@/server/db/tx";
import { updateBankDetails } from "@/server/domain/bank-details";
import {
  archiveLocation,
  createLocation,
  updateLocation,
} from "@/server/domain/buyer-locations";
import { updateOrgProfile } from "@/server/domain/org-profile";

export const updateOrgProfileAction = actorAction
  .inputSchema(updateOrgProfileSchema)
  .action(({ ctx, parsedInput }) =>
    withTx(ctx.actor, (tx) => updateOrgProfile(tx, ctx.actor, parsedInput)),
  );

export const createLocationAction = actorAction
  .inputSchema(createLocationSchema)
  .action(({ ctx, parsedInput }) =>
    withTx(ctx.actor, (tx) => createLocation(tx, ctx.actor, parsedInput)),
  );

export const updateLocationAction = actorAction
  .inputSchema(updateLocationSchema)
  .action(({ ctx, parsedInput }) =>
    withTx(ctx.actor, (tx) => updateLocation(tx, ctx.actor, parsedInput)),
  );

export const archiveLocationAction = actorAction
  .inputSchema(archiveLocationSchema)
  .action(({ ctx, parsedInput }) =>
    withTx(ctx.actor, (tx) => archiveLocation(tx, ctx.actor, parsedInput)),
  );

export const updateBankDetailsAction = actorAction
  .inputSchema(updateBankDetailsSchema)
  .action(({ ctx, parsedInput }) =>
    withTx(ctx.actor, (tx) => updateBankDetails(tx, ctx.actor, parsedInput)),
  );
