import { describe, expect, it } from "vitest";
import { companySchema, registrationSchema } from "@/lib/schemas/registration";
import {
  TAKEN,
  fieldErrorKey,
  fieldId,
  invalidPaths,
  mapActionError,
  passwordConfirmErrorKey,
  requestResetErrorKey,
  resetPasswordErrorKey,
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
        message: "x",
        reason: "TAX_ID_TAKEN",
      }),
    ).toEqual({ reason: "TAX_ID_TAKEN", field: "taxId" });
  });

  it("puts an existing account (409) on the e-mail field", () => {
    expect(
      mapActionError({
        code: "CONFLICT",
        message: "x",
        reason: "EMAIL_TAKEN",
      }),
    ).toEqual({ reason: "EMAIL_TAKEN", field: "email" });
  });

  it("sends a user who already has a company away (no form message)", () => {
    expect(
      mapActionError({
        code: "CONFLICT",
        message: "x",
        reason: "ALREADY_HAS_COMPANY",
      }),
    ).toEqual({ reason: "ALREADY_HAS_COMPANY" });
  });

  it("falls back to the generic message for a conflict without a reason", () => {
    expect(
      mapActionError({ code: "CONFLICT", message: "Something new." }),
    ).toEqual({ reason: "UNKNOWN", formKey: "auth.errors.form.generic" });
  });

  it("ignores the English message: only the reason counts", () => {
    expect(
      mapActionError({
        code: "CONFLICT",
        message: "A buyer with this tax ID (PIB) is already registered.",
      }),
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

describe("requestResetErrorKey", () => {
  it("shows the rate-limit message for HTTP 429", () => {
    expect(requestResetErrorKey({ status: 429 })).toBe(
      "auth.errors.form.rateLimited",
    );
  });

  it("shows the generic message for anything else (never about the account)", () => {
    expect(requestResetErrorKey({ status: 400 })).toBe(
      "auth.errors.form.generic",
    );
    expect(requestResetErrorKey({})).toBe("auth.errors.form.generic");
  });
});

describe("resetPasswordErrorKey", () => {
  it("calls an expired, used or unknown token an invalid link", () => {
    expect(resetPasswordErrorKey({ status: 400, code: "INVALID_TOKEN" })).toBe(
      "auth.errors.form.invalidResetLink",
    );
    expect(resetPasswordErrorKey({ code: "USER_NOT_FOUND" })).toBe(
      "auth.errors.form.invalidResetLink",
    );
  });

  it("maps a password the server finds too short or too long to 'validation'", () => {
    expect(resetPasswordErrorKey({ code: "PASSWORD_TOO_SHORT" })).toBe(
      "auth.errors.form.validation",
    );
    expect(resetPasswordErrorKey({ code: "PASSWORD_TOO_LONG" })).toBe(
      "auth.errors.form.validation",
    );
  });

  it("shows the rate-limit message for 429 and the generic one otherwise", () => {
    expect(resetPasswordErrorKey({ status: 429 })).toBe(
      "auth.errors.form.rateLimited",
    );
    expect(resetPasswordErrorKey({ status: 500 })).toBe(
      "auth.errors.form.generic",
    );
  });
});

describe("passwordConfirmErrorKey", () => {
  it("says 'required' when empty and 'mismatch' otherwise", () => {
    expect(passwordConfirmErrorKey("")).toBe(
      "auth.errors.passwordConfirm.required",
    );
    expect(passwordConfirmErrorKey(undefined)).toBe(
      "auth.errors.passwordConfirm.required",
    );
    expect(passwordConfirmErrorKey("abc")).toBe(
      "auth.errors.passwordConfirm.mismatch",
    );
  });
});
