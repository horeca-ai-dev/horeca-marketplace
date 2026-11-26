import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { companySchema, registrationSchema } from "@/lib/schemas/registration";
import {
  CONFLICT_MESSAGES,
  TAKEN,
  fieldErrorKey,
  fieldId,
  invalidPaths,
  mapActionError,
  signInErrorKey,
} from "./form-errors";

const validCompany = {
  legalName: "Hotel Budva d.o.o.",
  taxId: "02345678",
  addressLine: "Jadranski put 1",
  city: "Budva",
  postalCode: "85310",
  contactEmail: "nabavka@hotel.example",
};
const validAccount = {
  name: "Ana Anić",
  email: "ana@hotel.example",
  password: "long-enough-1",
};

describe("mapActionError", () => {
  it("puts a duplicate PIB (409) on the tax ID field", () => {
    expect(
      mapActionError({
        code: "CONFLICT",
        message: "A buyer with this tax ID (PIB) is already registered.",
      }),
    ).toEqual({ reason: "TAX_ID_TAKEN", field: "taxId" });
  });

  it("puts an existing account (409) on the e-mail field", () => {
    expect(
      mapActionError({
        code: "CONFLICT",
        message: "An account with this e-mail already exists. Please log in.",
      }),
    ).toEqual({ reason: "EMAIL_TAKEN", field: "email" });
  });

  it("reports 'already belongs to a company' as a form message", () => {
    expect(
      mapActionError({
        code: "CONFLICT",
        message: "This account already belongs to a company.",
      }),
    ).toEqual({
      reason: "ALREADY_HAS_COMPANY",
      formKey: "auth.errors.form.alreadyHasCompany",
    });
  });

  it("falls back to the generic message for a conflict it does not know", () => {
    expect(
      mapActionError({ code: "CONFLICT", message: "Something new." }),
    ).toEqual({ reason: "UNKNOWN", formKey: "auth.errors.form.generic" });
  });

  it("maps the other codes", () => {
    expect(mapActionError({ code: "UNAUTHENTICATED", message: "x" })).toEqual({
      reason: "UNAUTHENTICATED",
    });
    expect(mapActionError({ code: "FORBIDDEN", message: "x" })).toEqual({
      reason: "REGISTRATION_CLOSED",
      formKey: "auth.errors.form.registrationClosed",
    });
    expect(mapActionError({ code: "VALIDATION", message: "x" })).toEqual({
      reason: "VALIDATION",
      formKey: "auth.errors.form.validation",
    });
    expect(mapActionError({ code: "INTERNAL", message: "x" })).toEqual({
      reason: "UNKNOWN",
      formKey: "auth.errors.form.generic",
    });
    expect(mapActionError(undefined).reason).toBe("UNKNOWN");
  });

  // Option A matches the server's English texts. This fails as soon as one is reworded or removed,
  // instead of the form silently showing the generic message.
  it("matches texts that still exist in the server code", () => {
    const sources = [
      "src/server/domain/organizations.ts",
      "src/server/auth/registration.ts",
      "src/server/actions/registration.ts",
    ]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    for (const message of Object.keys(CONFLICT_MESSAGES)) {
      expect(sources).toContain(`"${message}"`);
    }
  });
});

describe("signInErrorKey", () => {
  it("shows the rate-limit message for HTTP 429", () => {
    expect(signInErrorKey({ status: 429 })).toBe(
      "auth.errors.form.rateLimited",
    );
  });

  it("shows one message for wrong e-mail or password", () => {
    expect(
      signInErrorKey({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" }),
    ).toBe("auth.errors.form.invalidCredentials");
    expect(signInErrorKey({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "auth.errors.form.invalidCredentials",
    );
  });

  it("is generic for everything else (network failure, 500)", () => {
    expect(signInErrorKey({ status: 500 })).toBe("auth.errors.form.generic");
    expect(signInErrorKey({})).toBe("auth.errors.form.generic");
  });
});

describe("fieldErrorKey", () => {
  it("says 'required' for an empty field and 'invalid' for a wrong one", () => {
    expect(fieldErrorKey("taxId", "")).toBe("auth.errors.taxId.required");
    expect(fieldErrorKey("taxId", "   ")).toBe("auth.errors.taxId.required");
    expect(fieldErrorKey("taxId", undefined)).toBe(
      "auth.errors.taxId.required",
    );
    expect(fieldErrorKey("taxId", "123")).toBe("auth.errors.taxId.invalid");
  });

  it("says 'taken' only for the fields the server can report as taken", () => {
    expect(fieldErrorKey("taxId", "02345678", TAKEN)).toBe(
      "auth.errors.taxId.taken",
    );
    expect(fieldErrorKey("email", "a@b.me", TAKEN)).toBe(
      "auth.errors.email.taken",
    );
    expect(fieldErrorKey("city", "Budva", TAKEN)).toBe(
      "auth.errors.city.invalid",
    );
  });

  it("has no 'required' message for the optional phone", () => {
    expect(fieldErrorKey("contactPhone", "")).toBe(
      "auth.errors.contactPhone.invalid",
    );
  });
});

describe("invalidPaths (server 422 → fields)", () => {
  it("finds the nested fields of the registration form", () => {
    expect(
      invalidPaths(registrationSchema, {
        account: { ...validAccount, email: "not-an-email" },
        company: { ...validCompany, taxId: "123", postalCode: "8531" },
      }),
    ).toEqual(["account.email", "company.taxId", "company.postalCode"]);
  });

  it("finds the flat fields of the company form", () => {
    expect(invalidPaths(companySchema, { ...validCompany, city: "" })).toEqual([
      "city",
    ]);
  });

  it("is empty when the browser's copy of the schema accepts the input", () => {
    expect(
      invalidPaths(registrationSchema, {
        account: validAccount,
        company: validCompany,
      }),
    ).toEqual([]);
  });
});

describe("fieldId", () => {
  it("turns a form path into a DOM id", () => {
    expect(fieldId("company.taxId")).toBe("company-taxId");
    expect(fieldId("email")).toBe("email");
  });
});
