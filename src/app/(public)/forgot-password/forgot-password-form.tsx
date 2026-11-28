"use client";

/**
 * Forgot-password form (D5-A2). Calls Better Auth's own endpoint (POST /api/auth/request-password-reset)
 * through its browser client — no Server Action of ours.
 *
 * No account enumeration: Better Auth answers a known and an unknown address with the same 200, and
 * we show the same confirmation for both. The only errors shown are about the request itself (rate
 * limit, server or network failure).
 *
 * The link in the e-mail goes to Better Auth's /api/auth/reset-password/<token>, which checks the
 * token and redirects to `redirectTo` (/reset-password) with ?token=… or ?error=INVALID_TOKEN.
 * Better Auth checks `redirectTo` against trustedOrigins (a relative path is our own origin).
 */
import { useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import {
  ErrorSummary,
  useErrorSummary,
} from "@/components/domain/form/error-summary";
import { SubmitButton } from "@/components/domain/form/submit-button";
import { TextField } from "@/components/domain/form/text-field";
import { authClient } from "@/lib/auth-client";
import {
  fieldErrorKey,
  requestResetErrorKey,
  type FormErrorKey,
} from "@/lib/auth/form-errors";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@/lib/schemas/password-reset";

export function ForgotPasswordForm() {
  const t = useTranslations();
  const {
    register,
    handleSubmit,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onBlur",
    shouldFocusError: false,
    defaultValues: { email: "" },
  });
  const { focusRequest, focus: focusSummary } = useErrorSummary();
  const [formError, setFormError] = useState<FormErrorKey | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const busy = useRef(false);
  // The confirmation replaces the form; focus moves to its heading so it is announced.
  const sentHeading = useRef<HTMLHeadingElement>(null);

  const emailError = errors.email
    ? t(fieldErrorKey("email", getValues("email"), errors.email.type))
    : undefined;

  async function onValid(values: ForgotPasswordInput) {
    if (busy.current) return;
    busy.current = true;
    setFormError(null);
    const { error } = await authClient
      .requestPasswordReset({
        email: values.email,
        redirectTo: "/reset-password",
      })
      .catch(() => ({ error: {} })); // network failure → the generic message
    busy.current = false;
    if (error) {
      setFormError(requestResetErrorKey(error));
      focusSummary();
      return;
    }
    setSentTo(values.email);
    requestAnimationFrame(() => sentHeading.current?.focus());
  }

  if (sentTo !== null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 ref={sentHeading} tabIndex={-1} className="text-2xl">
          {t("auth.forgotPassword.sentTitle")}
        </h1>
        <p className="text-sm">
          {t("auth.forgotPassword.sent", { email: sentTo })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("auth.forgotPassword.sentHint")}
        </p>
        <button
          type="button"
          className="self-start text-sm text-primary underline"
          onClick={() => {
            reset();
            setSentTo(null);
          }}
        >
          {t("auth.forgotPassword.tryAgain")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl">{t("auth.forgotPassword.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("auth.forgotPassword.description")}
        </p>
      </div>
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
          items={emailError ? [{ id: "email", text: emailError }] : []}
        />
        <TextField
          id="email"
          label={t("auth.fields.email.label")}
          type="email"
          autoComplete="email"
          required
          error={emailError}
          {...register("email")}
        />
        <SubmitButton
          pending={isSubmitting}
          label={t("auth.forgotPassword.submit")}
          pendingLabel={t("auth.forgotPassword.submitting")}
        />
      </form>
    </div>
  );
}
