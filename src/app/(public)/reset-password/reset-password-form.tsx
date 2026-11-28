"use client";

/**
 * New-password form (D5-A2). Calls Better Auth's own endpoint (POST /api/auth/reset-password) with the
 * token from the link — no Server Action of ours. Better Auth checks the token (once-only, 1 hour) and
 * the password length (8–128) again.
 *
 * On success the browser LOADS /login with a notice (a full page load, like after sign-in), so the
 * token does not stay in the page's memory or history state.
 */
import Link from "next/link";
import { useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import {
  ErrorSummary,
  useErrorSummary,
} from "@/components/domain/form/error-summary";
import { SubmitButton } from "@/components/domain/form/submit-button";
import { PasswordField } from "@/components/domain/form/text-field";
import { authClient } from "@/lib/auth-client";
import {
  fieldErrorKey,
  passwordConfirmErrorKey,
  resetPasswordErrorKey,
  type FormErrorKey,
} from "@/lib/auth/form-errors";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/lib/schemas/password-reset";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations();
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onBlur",
    shouldFocusError: false,
    defaultValues: { password: "", passwordConfirm: "" },
  });
  const { focusRequest, focus: focusSummary } = useErrorSummary();
  const [formError, setFormError] = useState<FormErrorKey | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const busy = useRef(false);

  const passwordError = errors.password
    ? t(fieldErrorKey("password", getValues("password"), errors.password.type))
    : undefined;
  const confirmError = errors.passwordConfirm
    ? t(passwordConfirmErrorKey(getValues("passwordConfirm")))
    : undefined;

  async function onValid(values: ResetPasswordInput) {
    if (busy.current) return;
    busy.current = true;
    setFormError(null);
    const { error } = await authClient
      .resetPassword({ newPassword: values.password, token })
      .catch(() => ({ error: {} })); // network failure → the generic message
    if (error) {
      busy.current = false;
      setFormError(resetPasswordErrorKey(error));
      focusSummary();
      return;
    }
    setRedirecting(true);
    // Deliberately a full page load, not router.push(): see the comment at the top.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login?notice=password-reset");
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
        items={[
          ...(passwordError ? [{ id: "password", text: passwordError }] : []),
          ...(confirmError
            ? [{ id: "passwordConfirm", text: confirmError }]
            : []),
        ]}
      />
      {formError === "auth.errors.form.invalidResetLink" ? (
        <Link
          href="/forgot-password"
          className="text-sm text-primary underline"
        >
          {t("auth.resetPassword.requestNewLink")}
        </Link>
      ) : null}
      <PasswordField
        id="password"
        label={t("auth.fields.newPassword.label")}
        help={t("auth.fields.password.help")}
        autoComplete="new-password"
        required
        error={passwordError}
        {...register("password", {
          // A changed password makes an earlier "mismatch" stale: check the repeat field again.
          deps: ["passwordConfirm"],
        })}
      />
      <PasswordField
        id="passwordConfirm"
        label={t("auth.fields.passwordConfirm.label")}
        autoComplete="new-password"
        required
        error={confirmError}
        {...register("passwordConfirm")}
      />
      <SubmitButton
        pending={isSubmitting || redirecting}
        label={t("auth.resetPassword.submit")}
        pendingLabel={t("auth.resetPassword.submitting")}
      />
    </form>
  );
}
