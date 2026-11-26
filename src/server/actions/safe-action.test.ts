/**
 * What a form receives from an action (CLAUDE.md rule 16) — here for the Conflict `reason` (issue #50).
 * The action is a throwaway one built on the real `actionClient`, so this goes through the real
 * handleServerError, not a copy of it.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// safe-action.ts imports resolveActor (database, auth); these tests never reach it.
vi.mock("@/server/auth/actor", () => ({ resolveActor: vi.fn() }));

import {
  Conflict,
  Forbidden,
  type ConflictReason,
} from "@/server/domain/errors";
import { actionClient } from "./safe-action";

const failing = (error: Error) =>
  actionClient.action(async () => {
    throw error;
  });

describe("handleServerError", () => {
  it.each<ConflictReason>([
    "TAX_ID_TAKEN",
    "EMAIL_TAKEN",
    "ALREADY_HAS_COMPANY",
  ])("passes the Conflict reason %s to the client", async (reason) => {
    const result = await failing(new Conflict("Taken.", { reason }))();
    expect(result.serverError).toEqual({
      ok: false,
      code: "CONFLICT",
      message: "Taken.",
      reason,
    });
  });

  it("a Conflict without a reason has no `reason` key at all", async () => {
    const result = await failing(new Conflict("Wrong status."))();
    expect(result.serverError).toEqual({
      ok: false,
      code: "CONFLICT",
      message: "Wrong status.",
    });
  });

  it("other domain errors are unchanged", async () => {
    const result = await failing(new Forbidden())();
    expect(result.serverError).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "You are not allowed to do this.",
    });
  });
});
