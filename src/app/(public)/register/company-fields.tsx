"use client";

/**
 * The company part of the form — shared by the register form (fields live under "company.…") and
 * "Complete company setup" (fields at the top level). The parent form owns React Hook Form; `bind`
 * gives each field its id, its register() props and its error text.
 */
import { useTranslations } from "next-intl";
import {
  TextField,
  type TextFieldProps,
} from "@/components/domain/form/text-field";
import type { CompanyFieldName } from "@/lib/auth/form-errors";

export type FieldBinding = Pick<
  TextFieldProps,
  "id" | "name" | "onChange" | "onBlur" | "ref" | "error"
>;

export function CompanyFields({
  bind,
}: {
  bind: (name: CompanyFieldName) => FieldBinding;
}) {
  const t = useTranslations("auth.fields");
  return (
    <>
      <TextField
        {...bind("legalName")}
        label={t("legalName.label")}
        autoComplete="organization"
        required
      />
      <TextField
        {...bind("taxId")}
        label={t("taxId.label")}
        help={t("taxId.help")}
        inputMode="numeric"
        autoComplete="off"
        required
      />
      <TextField
        {...bind("addressLine")}
        label={t("addressLine.label")}
        autoComplete="street-address"
        required
      />
      <TextField
        {...bind("city")}
        label={t("city.label")}
        autoComplete="address-level2"
        required
      />
      <TextField
        {...bind("postalCode")}
        label={t("postalCode.label")}
        help={t("postalCode.help")}
        inputMode="numeric"
        autoComplete="postal-code"
        required
      />
      <TextField
        {...bind("contactEmail")}
        label={t("contactEmail.label")}
        type="email"
        autoComplete="email"
        required
      />
      <TextField
        {...bind("contactPhone")}
        label={t("contactPhone.label")}
        type="tel"
        autoComplete="tel"
      />
    </>
  );
}
