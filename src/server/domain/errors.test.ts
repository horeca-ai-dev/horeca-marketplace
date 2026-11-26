import { describe, expect, it } from "vitest";
import { Conflict, DomainError } from "./errors";

describe("Conflict", () => {
  it("carries the reason it was given, next to the unchanged message and status", () => {
    const error = new Conflict(
      "A buyer with this tax ID (PIB) is already registered.",
      {
        reason: "TAX_ID_TAKEN",
      },
    );
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("CONFLICT");
    expect(error.status).toBe(409);
    expect(error.message).toBe(
      "A buyer with this tax ID (PIB) is already registered.",
    );
    expect(error.reason).toBe("TAX_ID_TAKEN");
  });

  it("has no reason when none is given (a 409 the client does not need to tell apart)", () => {
    expect(new Conflict("Wrong status.").reason).toBeUndefined();
  });
});
