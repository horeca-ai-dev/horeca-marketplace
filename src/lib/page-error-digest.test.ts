import { describe, expect, it } from "vitest";
import messages from "../../messages/sr-Latn-ME.json";
import { CONFLICT_REASONS } from "@/server/domain/errors";
import {
  decodePageErrorDigest,
  encodePageErrorDigest,
} from "./page-error-digest";

describe("page error digest", () => {
  it.each([
    { code: "VALIDATION" } as const,
    { code: "CONFLICT" } as const,
    ...CONFLICT_REASONS.map((reason) => ({
      code: "CONFLICT" as const,
      reason,
    })),
  ])("round-trips %o", (kind) => {
    expect(decodePageErrorDigest(encodePageErrorDigest(kind))).toEqual(kind);
  });

  it.each([
    undefined,
    "",
    "1234567890", // Next's own hash digest for an ordinary error
    "NEXT_HTTP_ERROR_FALLBACK;404",
    "horeca:",
    "horeca:FORBIDDEN",
    "horeca:VALIDATION:extra",
  ])("decodes %o as UNEXPECTED", (digest) => {
    expect(decodePageErrorDigest(digest)).toEqual({ code: "UNEXPECTED" });
  });

  it("drops a reason that is not on the list instead of trusting it", () => {
    expect(decodePageErrorDigest("horeca:CONFLICT:<script>")).toEqual({
      code: "CONFLICT",
    });
  });

  it("has a text for every conflict reason", () => {
    for (const reason of CONFLICT_REASONS) {
      expect(messages.errors.conflict.reason[reason]).toEqual(
        expect.any(String),
      );
    }
  });
});
