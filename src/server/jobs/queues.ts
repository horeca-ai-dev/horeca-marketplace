/**
 * Job queues and their payloads (D2-B4, CLAUDE.md rule 11).
 *
 * One entry per queue. Adding a queue = add it here; the migrate entry creates every queue in this
 * list (createQueue is idempotent), and `enqueue()` only accepts names and payloads from here.
 *
 * Payloads carry IDs only — never names, amounts or e-mail bodies. The pg-boss tables have no RLS and
 * horeca_app may insert any job, so a processor treats its payload as untrusted input: it re-reads the
 * rows by ID and re-checks their state before doing anything.
 *
 * Planned (added by their own tasks): search.sync (products), image.resize (3 WebP sizes),
 * invoice.render (PDF), csv.import (acts FOR a user: carries the actor captured at enqueue time).
 */
import { z } from "zod";

export const queues = {
  /** One e-mail. `template` picks the React Email template; the processor loads everything else by id. */
  "email.send": z.object({
    template: z.enum([
      "password-reset",
      "order-confirmation",
      "supplier-new-sub-order",
    ]),
    id: z.string().min(1).max(64),
  }),
} as const;

export type QueueName = keyof typeof queues;
export type Payload<Q extends QueueName> = z.infer<(typeof queues)[Q]>;

export const QUEUE_NAMES = Object.keys(queues) as QueueName[];
