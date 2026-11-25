"use server";
/**
 * THROWAWAY (G0 check) — the single Server Action of the G0 page. Delete after gate G0.
 *
 * This is the shape of every Server Action in the project: Zod schema → actor (middleware) →
 * withTx(actor) → domain function. No business logic here.
 */
import { z } from "zod";
import { actorAction } from "@/server/actions/safe-action";
import { withTx } from "@/server/db/tx";
import { ping } from "@/server/domain/g0-ping";

export const pingAction = actorAction
  .inputSchema(z.object({ note: z.string().trim().min(1).max(50) }))
  .action(async ({ parsedInput, ctx: { actor } }) =>
    withTx(actor, (tx) => ping(tx, actor, parsedInput)),
  );
