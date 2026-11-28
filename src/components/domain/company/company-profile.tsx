"use client";

/**
 * The company profile section of /buyer/company and /supplier/company (D5-A3; matrix:
 * orgProfile.view / orgProfile.update).
 *
 * Everyone in the organization sees the profile. Only the owner (`canEdit`, decided by the page with
 * policy.can) gets "Uredite podatke", which turns the section into an inline form — inline, not a
 * modal: DESIGN.md allows no modals for long forms. The server refuses a member's edit anyway; the
 * UI just does not offer one.
 *
 * The update replaces every company field, so the form sends all of them:
 *   - the tax ID (PIB) changes only through the platform: shown as text, sent back unchanged
 *   - the VAT number is in the form (leaving it out would erase it)
 * Same schema as the server (updateOrgProfileSchema = the registration companySchema).
 */
import { useRef, useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import {
  ErrorSummary,
  useErrorSummary,
} from "@/components/domain/form/error-summary";
import { SubmitButton } from "@/components/domain/form/submit-button";
import { TextField } from "@/components/domain/form/text-field";
import { notify } from "@/components/domain/toaster";
import { Button } from "@/components/ui/button";
import { invalidPaths } from "@/lib/auth/form-errors";
import { loadPage } from "@/lib/auth/load-page";
import {
  companyFieldErrorKey,
  mapCompanyActionError,
  type CompanyFormErrorKey,
} from "@/lib/company/form-errors";
import {
  updateOrgProfileSchema,
  type UpdateOrgProfileInput,
} from "@/lib/schemas/company";
import { updateOrgProfileAction } from "@/server/actions/company";
import type { CompanyProfileView } from "./profile-view";

type FormValues = UpdateOrgProfileInput;
type FormOutput = z.output<typeof updateOrgProfileSchema>;
/** The inputs on screen — every field except the read-only tax ID. */
const EDITABLE = [
  "legalName",
  "vatNumber",
  "addressLine",
  "city",
  "postalCode",
  "contactEmail",
  "contactPhone",
] as const;
type EditableField = (typeof EDITABLE)[number];

const fieldId = (name: string) => `profile-${name}`;

export function CompanyProfile({
  profile,
  canEdit,
}: {
  profile: CompanyProfileView;
  canEdit: boolean;
}) {
  const t = useTranslations();
  const [editing, setEditing] = useState(false);

  return (
    <section aria-labelledby="profile-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="profile-heading" className="text-xl">
          {t("company.profile.heading")}
        </h2>
        {canEdit && !editing ? (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {t("company.profile.edit")}
          </Button>
        ) : null}
      </div>
      {!canEdit ? (
        <p className="text-sm text-muted-foreground">
          {t("company.profile.ownerOnly")}
        </p>
      ) : null}
      {editing ? (
        <ProfileForm profile={profile} onDone={() => setEditing(false)} />
      ) : (
        <ProfileDetails profile={profile} />
      )}
    </section>
  );
}

function ProfileDetails({ profile }: { profile: CompanyProfileView }) {
  const t = useTranslations();
  const notEntered = (
    <span className="text-muted-foreground">
      {t("company.profile.notEntered")}
    </span>
  );
  const rows: [string, ReactNode][] = [
    [t("auth.fields.legalName.label"), profile.legalName],
    [t("auth.fields.taxId.label"), profile.taxId],
    [t("company.profile.fields.vatNumber"), profile.vatNumber ?? notEntered],
    [
      t("company.profile.fields.address"),
      `${profile.addressLine}, ${profile.postalCode} ${profile.city}`,
    ],
    [t("auth.fields.contactEmail.label"), profile.contactEmail],
    [
      t("company.profile.fields.contactPhone"),
      profile.contactPhone ?? notEntered,
    ],
  ];
  return (
    // A two-column specification list (label left, value right, 1 px rows); stacked on phones.
    <dl className="max-w-3xl">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid gap-1 border-b border-border py-2 sm:grid-cols-[14rem_1fr] sm:gap-4"
        >
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="text-base break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProfileForm({
  profile,
  onDone,
}: {
  profile: CompanyProfileView;
  onDone: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(updateOrgProfileSchema),
    mode: "onBlur",
    // Focus goes to the error summary instead of the first invalid field.
    shouldFocusError: false,
    // The tax ID has no input: it stays in the values from here and is sent back unchanged.
    defaultValues: {
      legalName: profile.legalName,
      taxId: profile.taxId,
      vatNumber: profile.vatNumber ?? "",
      addressLine: profile.addressLine,
      city: profile.city,
      postalCode: profile.postalCode,
      contactEmail: profile.contactEmail,
      contactPhone: profile.contactPhone ?? "",
    },
  });
  const { focusRequest, focus: focusSummary } = useErrorSummary();
  const [formError, setFormError] = useState<CompanyFormErrorKey | null>(null);
  const [leaving, setLeaving] = useState(false);
  // Blocks a second submit that arrives before React has disabled the button.
  const busy = useRef(false);

  const errorText = (name: EditableField) =>
    errors[name] ? t(companyFieldErrorKey(name, getValues(name))) : undefined;
  const bind = (name: EditableField) => ({
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

    const result = await updateOrgProfileAction(values).catch(() => undefined);
    if (result?.data) {
      busy.current = false;
      notify.success(t("company.profile.saved"));
      onDone();
      router.refresh(); // the Server Component reads the saved profile again
      return;
    }

    const failure = mapCompanyActionError(result);
    if (failure.kind === "unauthenticated") {
      setLeaving(true);
      loadPage("/login");
      return;
    }
    if (failure.kind === "fields") {
      for (const path of invalidPaths(updateOrgProfileSchema, getValues())) {
        if ((EDITABLE as readonly string[]).includes(path)) {
          setError(path as EditableField, { type: "server" });
        }
      }
    }
    fail(failure.formKey);
  }

  return (
    <form
      noValidate
      onSubmit={(event) =>
        void handleSubmit(onValid, () => {
          setFormError(null);
          focusSummary();
        })(event)
      }
      className="flex max-w-xl flex-col gap-4"
    >
      <ErrorSummary
        focusRequest={focusRequest}
        title={t("auth.errors.summaryTitle")}
        message={formError ? t(formError) : undefined}
        items={EDITABLE.flatMap((name) => {
          const text = errorText(name);
          return text ? [{ id: fieldId(name), text }] : [];
        })}
      />
      <TextField
        {...bind("legalName")}
        label={t("auth.fields.legalName.label")}
        autoComplete="organization"
        required
      />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t("auth.fields.taxId.label")}</p>
        <p className="text-base">{profile.taxId}</p>
        <p className="text-sm text-muted-foreground">
          {t("company.profile.taxIdNote")}
        </p>
      </div>
      <TextField
        {...bind("vatNumber")}
        label={t("company.profile.fields.vatNumberOptional")}
        autoComplete="off"
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
        {...bind("contactEmail")}
        label={t("auth.fields.contactEmail.label")}
        type="email"
        autoComplete="email"
        required
      />
      <TextField
        {...bind("contactPhone")}
        label={t("auth.fields.contactPhone.label")}
        type="tel"
        autoComplete="tel"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <SubmitButton
          pending={isSubmitting || leaving}
          label={t("company.profile.submit")}
          pendingLabel={t("company.profile.submitting")}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={isSubmitting || leaving}
          onClick={onDone}
        >
          {t("company.profile.cancel")}
        </Button>
      </div>
    </form>
  );
}
