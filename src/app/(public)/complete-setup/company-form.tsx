"use client";

/**
 * "Complete company setup" form (D4-A3): the company part only, for a logged-in user without an
 * organization. Same schema (companySchema) and same server transaction as registration, through
 * completeCompanySetupAction.
 *
 * If the register form left a company draft in sessionStorage (registration stopped after the
 * account was created), the form starts pre-filled from it and says so — but only if the draft was
 * saved for THIS user (`userId`, the logged-in user, from the server). The draft is read in the
 * browser after the page has loaded (the server cannot see sessionStorage), validated by the shared
 * schema, and deleted once the company exists.
 */
import { useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import {
  ErrorSummary,
  useErrorSummary,
} from "@/components/domain/form/error-summary";
import { SubmitButton } from "@/components/domain/form/submit-button";
import {
  browserDraftStorage,
  clearCompanyDraft,
  loadCompanyDraft,
  saveCompanyDraft,
} from "@/lib/auth/company-draft";
import { areaFor } from "@/lib/auth/destination";
import {
  COMPANY_FIELDS,
  TAKEN,
  fieldErrorKey,
  invalidPaths,
  mapActionError,
  type CompanyFieldName,
  type FormErrorKey,
} from "@/lib/auth/form-errors";
import { loadPage } from "@/lib/auth/load-page";
import { companySchema, type CompanyInput } from "@/lib/schemas/registration";
import { completeCompanySetupAction } from "@/server/actions/registration";
import { CompanyFields } from "../register/company-fields";

/** What the inputs hold (before Zod trims and turns "" into undefined). */
type FormValues = z.input<typeof companySchema>;

const EMPTY: FormValues = {
  legalName: "",
  taxId: "",
  addressLine: "",
  city: "",
  postalCode: "",
  contactEmail: "",
  contactPhone: "",
};

export function CompanyForm({ userId }: { userId: string }) {
  const t = useTranslations();
  const [prefilled, setPrefilled] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, CompanyInput>({
    resolver: zodResolver(companySchema),
    mode: "onBlur",
    // Focus goes to the error summary instead of the first invalid field.
    shouldFocusError: false,
    // A function: React Hook Form calls it in the browser after the first render, then fills the
    // inputs — so the server-rendered (empty) form and the browser's first render are identical.
    defaultValues: async () => {
      const draft = loadCompanyDraft(browserDraftStorage(), userId);
      if (draft) setPrefilled(true);
      return draft ?? EMPTY;
    },
  });
  const { focusRequest, focus: focusSummary } = useErrorSummary();
  const [formError, setFormError] = useState<FormErrorKey | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  // Blocks a second submit that arrives before React has disabled the button.
  const busy = useRef(false);

  const errorText = (name: CompanyFieldName) => {
    const error = errors[name];
    return error
      ? t(fieldErrorKey(name, getValues(name), error.type))
      : undefined;
  };

  function fail(key: FormErrorKey | null) {
    busy.current = false;
    setFormError(key);
    focusSummary();
  }

  async function onValid(values: CompanyInput) {
    if (busy.current) return;
    busy.current = true;
    setFormError(null);

    const result = await completeCompanySetupAction(values).catch(
      () => undefined, // network failure → the generic message below
    );

    if (result?.data) {
      clearCompanyDraft(browserDraftStorage());
      setRedirecting(true);
      loadPage(areaFor(result.data.type));
      return;
    }
    if (result?.validationErrors) {
      for (const path of invalidPaths(companySchema, getValues())) {
        if ((COMPANY_FIELDS as readonly string[]).includes(path)) {
          setError(path as CompanyFieldName, { type: "server" });
        }
      }
      fail("auth.errors.form.validation");
      return;
    }

    const failure = mapActionError(result?.serverError);
    switch (failure.reason) {
      case "TAX_ID_TAKEN":
        setError("taxId", { type: TAKEN });
        fail(null);
        return;
      case "UNAUTHENTICATED":
        // The session ended: log in again, then come back here.
        saveCompanyDraft(browserDraftStorage(), userId, getValues());
        setRedirecting(true);
        loadPage("/login?notice=account-created");
        return;
      case "ALREADY_HAS_COMPANY":
        // Nothing left to do here — /login sends a logged-in user to their area.
        setRedirecting(true);
        loadPage("/login");
        return;
      case "EMAIL_TAKEN": // not possible here: this form creates no account
        fail("auth.errors.form.generic");
        return;
      default:
        fail(failure.formKey);
    }
  }

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
      className="flex flex-col gap-4"
    >
      {prefilled ? (
        <p
          role="status"
          className="rounded-md bg-attention-bg p-3 text-sm text-attention-text"
        >
          {t("auth.completeSetup.prefilled")}
        </p>
      ) : null}
      <ErrorSummary
        focusRequest={focusRequest}
        title={t("auth.errors.summaryTitle")}
        message={formError ? t(formError) : undefined}
        items={COMPANY_FIELDS.flatMap((name) => {
          const text = errorText(name);
          return text ? [{ id: name, text }] : [];
        })}
      />
      <CompanyFields
        bind={(name) => ({
          id: name,
          error: errorText(name),
          ...register(name),
        })}
      />
      <SubmitButton
        pending={isSubmitting || redirecting}
        label={t("auth.completeSetup.submit")}
        pendingLabel={t("auth.completeSetup.submitting")}
      />
    </form>
  );
}
