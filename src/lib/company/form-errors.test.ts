import { describe, expect, it } from "vitest";
import {
  companyFieldErrorKey,
  groupIban,
  mapCompanyActionError,
} from "./form-errors";

describe("mapCompanyActionError", () => {
  it("treats a failed request (no result) as the generic message", () => {
    expect(mapCompanyActionError(undefined)).toEqual({
      kind: "form",
      formKey: "company.errors.form.generic",
    });
  });

  it("asks the form to mark fields for Zod (validationErrors) and domain (VALIDATION) rejections", () => {
    const fields = {
      kind: "fields",
      formKey: "company.errors.form.validation",
    };
    expect(
      mapCompanyActionError({ validationErrors: { fieldErrors: {} } }),
    ).toEqual(fields);
    expect(
      mapCompanyActionError({ serverError: { code: "VALIDATION" } }),
    ).toEqual(fields);
  });

  it("sends an expired session to the login page", () => {
    expect(
      mapCompanyActionError({ serverError: { code: "UNAUTHENTICATED" } }),
    ).toEqual({ kind: "unauthenticated" });
  });

  it("explains a 403 as owner-only and a 404 as a vanished record", () => {
    expect(
      mapCompanyActionError({ serverError: { code: "FORBIDDEN" } }),
    ).toEqual({ kind: "form", formKey: "company.errors.form.ownerOnly" });
    expect(
      mapCompanyActionError({ serverError: { code: "NOT_FOUND" } }),
    ).toEqual({ kind: "form", formKey: "company.errors.form.notFound" });
  });

  it("tells conflicts apart by reason, never by message", () => {
    expect(
      mapCompanyActionError({
        serverError: { code: "CONFLICT", reason: "DEFAULT_LOCATION_ARCHIVE" },
      }),
    ).toEqual({
      kind: "form",
      formKey: "errors.conflict.reason.DEFAULT_LOCATION_ARCHIVE",
    });
    expect(
      mapCompanyActionError({
        serverError: { code: "CONFLICT", reason: "TAX_ID_TAKEN" },
      }),
    ).toEqual({
      kind: "form",
      formKey: "errors.conflict.reason.TAX_ID_TAKEN",
    });
    // No reason (archived location edited, default changed at the same time) or one these pages do
    // not expect: "the data changed, try again".
    expect(
      mapCompanyActionError({ serverError: { code: "CONFLICT" } }),
    ).toEqual({ kind: "form", formKey: "errors.conflict.message" });
    expect(
      mapCompanyActionError({
        serverError: { code: "CONFLICT", reason: "SKU_TAKEN" },
      }),
    ).toEqual({ kind: "form", formKey: "errors.conflict.message" });
  });

  it("falls back to the generic message for INTERNAL and unknown codes", () => {
    for (const code of ["INTERNAL", "SOMETHING_NEW"]) {
      expect(mapCompanyActionError({ serverError: { code } })).toEqual({
        kind: "form",
        formKey: "company.errors.form.generic",
      });
    }
  });
});

describe("companyFieldErrorKey", () => {
  it("reuses the register form's messages for the shared company fields", () => {
    expect(companyFieldErrorKey("legalName", "")).toBe(
      "auth.errors.legalName.required",
    );
    expect(companyFieldErrorKey("postalCode", "123")).toBe(
      "auth.errors.postalCode.invalid",
    );
    expect(companyFieldErrorKey("contactPhone", "x".repeat(51))).toBe(
      "auth.errors.contactPhone.invalid",
    );
  });

  it("has required / invalid messages for the location label and the IBAN", () => {
    expect(companyFieldErrorKey("label", "  ")).toBe(
      "company.errors.label.required",
    );
    expect(companyFieldErrorKey("label", "x".repeat(101))).toBe(
      "company.errors.label.invalid",
    );
    expect(companyFieldErrorKey("iban", "")).toBe(
      "company.errors.iban.required",
    );
    expect(companyFieldErrorKey("iban", "ME00 1234")).toBe(
      "company.errors.iban.invalid",
    );
  });

  it("has only an 'invalid' message for the optional fields", () => {
    expect(companyFieldErrorKey("vatNumber", "x".repeat(51))).toBe(
      "company.errors.vatNumber.invalid",
    );
    expect(companyFieldErrorKey("contactName", "x".repeat(101))).toBe(
      "company.errors.contactName.invalid",
    );
  });
});

describe("groupIban", () => {
  it("groups an IBAN in fours", () => {
    expect(groupIban("ME25505000012345678951")).toBe(
      "ME25 5050 0001 2345 6789 51",
    );
    expect(groupIban("ME25")).toBe("ME25");
  });
});
