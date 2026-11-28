"use client";

/**
 * Add / edit a delivery location (D5-A3; matrix: buyerLocation.create / .update — every buyer member,
 * not only the owner). Rendered inside the SidePanel (`?open=new` or `?open=<id>`): a 7-field form is
 * too long for a modal (DESIGN.md).
 *
 * "Postavite kao podrazumijevanu" is the update's `makeDefault` flag; the server switches the old
 * default off in the same transaction. On the current default the box is shown ticked and disabled
 * with the reason: the default changes only by making ANOTHER location the default.
 *
 * Same schema as the server (createLocationSchema; the update adds only `locationId`).
 */
import { useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import {
  ErrorSummary,
  useErrorSummary,
} from "@/components/domain/form/error-summary";
import { SubmitButton } from "@/components/domain/form/submit-button";
import { TextField } from "@/components/domain/form/text-field";
import { notify } from "@/components/domain/toaster";
import { Checkbox } from "@/components/ui/checkbox";
import { invalidPaths } from "@/lib/auth/form-errors";
import { loadPage } from "@/lib/auth/load-page";
import {
  companyFieldErrorKey,
  mapCompanyActionError,
  type CompanyFormErrorKey,
} from "@/lib/company/form-errors";
import {
  createLocationSchema,
  type CreateLocationInput,
} from "@/lib/schemas/company";
import {
  createLocationAction,
  updateLocationAction,
} from "@/server/actions/company";
import type { LocationRow } from "./location-row";

type FormOutput = z.output<typeof createLocationSchema>;
const TEXT_FIELDS = [
  "label",
  "addressLine",
  "city",
  "postalCode",
  "contactName",
  "contactPhone",
] as const;
type TextFieldName = (typeof TEXT_FIELDS)[number];

const fieldId = (name: string) => `location-${name}`;

export function LocationForm({
  location,
  onSaved,
}: {
  /** undefined = a new location. */
  location?: LocationRow;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const {
    register,
    control,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateLocationInput, unknown, FormOutput>({
    resolver: zodResolver(createLocationSchema),
    mode: "onBlur",
    shouldFocusError: false,
    defaultValues: {
      label: location?.label ?? "",
      addressLine: location?.addressLine ?? "",
      city: location?.city ?? "",
      postalCode: location?.postalCode ?? "",
      contactName: location?.contactName ?? "",
      contactPhone: location?.contactPhone ?? "",
      makeDefault: false,
    },
  });
  const { focusRequest, focus: focusSummary } = useErrorSummary();
  const [formError, setFormError] = useState<CompanyFormErrorKey | null>(null);
  const [leaving, setLeaving] = useState(false);
  const busy = useRef(false);

  const errorText = (name: TextFieldName) =>
    errors[name] ? t(companyFieldErrorKey(name, getValues(name))) : undefined;
  const bind = (name: TextFieldName) => ({
    id: fieldId(name),
    error: errorText(name),
    ...register(name),
  });

  function fail(key: CompanyFormErrorKey | null) {
    busy.current = false;
    setFormError(key);
    focusSummary();
  }

  async function onValid(values: FormOutput) {
    if (busy.current) return;
    busy.current = true;
    setFormError(null);

    const result = await (
      location
        ? updateLocationAction({ locationId: location.id, ...values })
        : createLocationAction(values)
    ).catch(() => undefined);
    if (result?.data) {
      busy.current = false;
      notify.success(
        t(
          location ? "company.locations.updated" : "company.locations.created",
          { label: result.data.label },
        ),
      );
      onSaved();
      return;
    }

    const failure = mapCompanyActionError(result);
    if (failure.kind === "unauthenticated") {
      setLeaving(true);
      loadPage("/login");
      return;
    }
    if (failure.kind === "fields") {
      for (const path of invalidPaths(createLocationSchema, getValues())) {
        if ((TEXT_FIELDS as readonly string[]).includes(path)) {
          setError(path as TextFieldName, { type: "server" });
        }
      }
    }
    fail(failure.formKey);
  }

  return (
    <form
      // No JS yet (slow or failed bundle): a native submit must never put fields in the URL.
      method="post"
      noValidate
      onSubmit={(event) =>
        void handleSubmit(onValid, () => {
          setFormError(null);
          focusSummary();
        })(event)
      }
      className="flex flex-col gap-4"
    >
      <ErrorSummary
        focusRequest={focusRequest}
        title={t("auth.errors.summaryTitle")}
        message={formError ? t(formError) : undefined}
        items={TEXT_FIELDS.flatMap((name) => {
          const text = errorText(name);
          return text ? [{ id: fieldId(name), text }] : [];
        })}
      />
      <TextField
        {...bind("label")}
        label={t("company.locations.fields.label")}
        help={t("company.locations.fields.labelHelp")}
        autoComplete="off"
        required
      />
      <TextField
        {...bind("addressLine")}
        label={t("auth.fields.addressLine.label")}
        autoComplete="street-address"
        required
      />
      <TextField
        {...bind("city")}
        label={t("auth.fields.city.label")}
        autoComplete="address-level2"
        required
      />
      <TextField
        {...bind("postalCode")}
        label={t("auth.fields.postalCode.label")}
        help={t("auth.fields.postalCode.help")}
        inputMode="numeric"
        autoComplete="postal-code"
        required
      />
      <TextField
        {...bind("contactName")}
        label={t("company.locations.fields.contactName")}
        autoComplete="name"
      />
      <TextField
        {...bind("contactPhone")}
        label={t("company.locations.fields.contactPhone")}
        type="tel"
        autoComplete="tel"
      />
      {location?.isDefault ? (
        <div className="flex items-start gap-3">
          <Checkbox
            id={fieldId("makeDefault")}
            checked
            disabled
            aria-describedby={`${fieldId("makeDefault")}-reason`}
            className="mt-0.5"
          />
          <div className="flex flex-col gap-1">
            <label
              htmlFor={fieldId("makeDefault")}
              className="text-sm font-medium"
            >
              {t("company.locations.fields.makeDefault")}
            </label>
            <p
              id={`${fieldId("makeDefault")}-reason`}
              className="text-sm text-muted-foreground"
            >
              {t("company.locations.fields.isDefault")}
            </p>
          </div>
        </div>
      ) : (
        <Controller
          control={control}
          name="makeDefault"
          render={({ field }) => (
            // The label wraps the box: the whole line is the (≥ 44 px) touch target.
            <label className="flex min-h-(--control-h) items-center gap-3 text-sm font-medium">
              <Checkbox
                id={fieldId("makeDefault")}
                checked={field.value === true}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                onBlur={field.onBlur}
                ref={field.ref}
              />
              {t("company.locations.fields.makeDefault")}
            </label>
          )}
        />
      )}
      <SubmitButton
        pending={isSubmitting || leaving}
        label={t("company.locations.submit")}
        pendingLabel={t("company.locations.submitting")}
      />
    </form>
  );
}
