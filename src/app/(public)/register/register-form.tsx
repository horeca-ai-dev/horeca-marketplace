"use client";

/**
 * Register form (D4-A3): account + buyer company in one form, validated with the SAME Zod schema
 * the server uses (src/lib/schemas/registration.ts).
 *
 * One call: registerCompanyAction creates the user (Better Auth, on the server), then the company,
 * and sets the session cookie. On success the browser loads the buyer area.
 *
 * Half-finished registration: the user is created BEFORE the company. If the company step fails
 * (PIB already registered), the account exists and sending the whole form again would answer
 * "e-mail already exists". So after that failure the form switches to company-only mode
 * (`accountCreated`): the account part is hidden, the typed company data stays, and the next submit
 * calls completeCompanySetupAction. If the server then finds no session, the user is sent to the
 * login page with a notice; after logging in they land on "Complete company setup".
 *
 * Whenever the account may exist without a company, the COMPANY fields (never the account part or
 * the password) are saved as a draft in sessionStorage, so "Complete company setup" can pre-fill
 * them (src/lib/auth/company-draft.ts).
 */
import { useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { get, useForm, type FieldError } from "react-hook-form";
import type { z } from "zod";
import {
  ErrorSummary,
  useErrorSummary,
} from "@/components/domain/form/error-summary";
import { SubmitButton } from "@/components/domain/form/submit-button";
import { PasswordField, TextField } from "@/components/domain/form/text-field";
import {
  browserDraftStorage,
  clearCompanyDraft,
  saveCompanyDraft,
} from "@/lib/auth/company-draft";
import { areaFor } from "@/lib/auth/destination";
import {
  ACCOUNT_FIELDS,
  COMPANY_FIELDS,
  TAKEN,
  fieldErrorKey,
  fieldId,
  invalidPaths,
  mapActionError,
  type AccountFieldName,
  type CompanyFieldName,
  type FieldName,
  type FormErrorKey,
} from "@/lib/auth/form-errors";
import { loadPage } from "@/lib/auth/load-page";
import {
  registrationSchema,
  type RegistrationInput,
} from "@/lib/schemas/registration";
import {
  completeCompanySetupAction,
  registerCompanyAction,
} from "@/server/actions/registration";
import { CompanyFields } from "./company-fields";

/** What the inputs hold (before Zod trims and turns "" into undefined). */
type FormValues = z.input<typeof registrationSchema>;
type FormPath = `account.${AccountFieldName}` | `company.${CompanyFieldName}`;

const ACCOUNT_PATHS = ACCOUNT_FIELDS.map((name) => `account.${name}` as const);
const COMPANY_PATHS = COMPANY_FIELDS.map((name) => `company.${name}` as const);
const ALL_PATHS: readonly FormPath[] = [...ACCOUNT_PATHS, ...COMPANY_PATHS];

export function RegisterForm() {
  const t = useTranslations();
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, RegistrationInput>({
    resolver: zodResolver(registrationSchema),
    mode: "onBlur",
    // Focus goes to the error summary instead of the first invalid field.
    shouldFocusError: false,
    defaultValues: {
      account: { name: "", email: "", password: "" },
      company: {
        legalName: "",
        taxId: "",
        addressLine: "",
        city: "",
        postalCode: "",
        contactEmail: "",
        contactPhone: "",
      },
    },
  });
  const { focusRequest, focus: focusSummary } = useErrorSummary();
  const [formError, setFormError] = useState<FormErrorKey | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  // Blocks a second submit that arrives before React has disabled the button.
  const busy = useRef(false);

  const errorText = (path: FormPath) => {
    const error = get(errors, path) as FieldError | undefined;
    if (!error) return undefined;
    const name = path.split(".")[1] as FieldName;
    return t(fieldErrorKey(name, getValues(path), error.type));
  };
  const bind = (path: FormPath) => ({
    id: fieldId(path),
    error: errorText(path),
    ...register(path),
  });

  function fail(key: FormErrorKey | null) {
    busy.current = false;
    setFormError(key);
    focusSummary();
  }

  async function onValid(values: RegistrationInput) {
    if (busy.current) return;
    busy.current = true;
    setFormError(null);

    const result = await (
      accountCreated
        ? completeCompanySetupAction(values.company)
        : registerCompanyAction(values)
    ).catch(() => undefined); // network failure → the generic message below

    if (result?.data) {
      clearCompanyDraft(browserDraftStorage());
      setRedirecting(true);
      loadPage(areaFor(result.data.type));
      return;
    }
    if (result?.validationErrors) {
      // The server names only "account" / "company": find the fields with the shared schema.
      for (const path of invalidPaths(registrationSchema, getValues())) {
        if ((ALL_PATHS as readonly string[]).includes(path)) {
          setError(path as FormPath, { type: "server" });
        }
      }
      fail("auth.errors.form.validation");
      return;
    }

    const failure = mapActionError(result?.serverError);
    // The account exists (PIB taken, no session) or may exist (unexpected error after sign-up):
    // keep the company data for "Complete company setup". Only the company part is passed.
    if (
      failure.reason === "TAX_ID_TAKEN" ||
      failure.reason === "UNAUTHENTICATED" ||
      failure.reason === "UNKNOWN"
    ) {
      saveCompanyDraft(browserDraftStorage(), getValues("company"));
    }
    switch (failure.reason) {
      case "TAX_ID_TAKEN":
        // The user exists now; only the company is missing (see the comment at the top).
        setAccountCreated(true);
        setError("company.taxId", { type: TAKEN });
        fail(null);
        return;
      case "EMAIL_TAKEN":
        setError("account.email", { type: TAKEN });
        fail(null);
        return;
      case "UNAUTHENTICATED":
        // Company-only mode, but the session is missing: log in, then finish on /complete-setup.
        setRedirecting(true);
        loadPage("/login?notice=account-created");
        return;
      case "ALREADY_HAS_COMPANY":
        // Nothing left to do here — /login sends a logged-in user to their area.
        setRedirecting(true);
        loadPage("/login");
        return;
      default:
        fail(failure.formKey);
    }
  }

  const visiblePaths = accountCreated ? COMPANY_PATHS : ALL_PATHS;

  return (
    <form
      noValidate
      // handleSubmit is called inside the event handler (not while rendering): onValid reads a ref.
      onSubmit={(event) =>
        void handleSubmit(onValid, () => {
          setFormError(null);
          focusSummary();
        })(event)
      }
      className="flex flex-col gap-8"
    >
      <ErrorSummary
        focusRequest={focusRequest}
        title={t("auth.errors.summaryTitle")}
        message={formError ? t(formError) : undefined}
        items={visiblePaths.flatMap((path) => {
          const text = errorText(path);
          return text ? [{ id: fieldId(path), text }] : [];
        })}
      />

      {accountCreated ? (
        <p
          role="status"
          className="rounded-md bg-attention-bg p-3 text-sm text-attention-text"
        >
          {t("auth.register.accountCreated", {
            email: getValues("account.email"),
          })}
        </p>
      ) : (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-4 text-lg font-semibold">
            {t("auth.register.accountLegend")}
          </legend>
          <TextField
            {...bind("account.name")}
            label={t("auth.fields.name.label")}
            autoComplete="name"
            required
          />
          <TextField
            {...bind("account.email")}
            label={t("auth.fields.email.label")}
            type="email"
            autoComplete="email"
            required
          />
          <PasswordField
            {...bind("account.password")}
            label={t("auth.fields.password.label")}
            help={t("auth.fields.password.help")}
            autoComplete="new-password"
            required
          />
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-4 text-lg font-semibold">
          {t("auth.register.companyLegend")}
        </legend>
        <CompanyFields bind={(name) => bind(`company.${name}`)} />
      </fieldset>

      <SubmitButton
        pending={isSubmitting || redirecting}
        label={t("auth.register.submit")}
        pendingLabel={t("auth.register.submitting")}
      />
    </form>
  );
}
