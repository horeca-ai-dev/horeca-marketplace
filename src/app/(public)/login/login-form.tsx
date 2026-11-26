"use client";

/**
 * Login form (D4-A3). Signs in through Better Auth's own endpoint (POST /api/auth/sign-in/email)
 * with its browser client — no Server Action of ours.
 *
 * After a successful sign-in the browser LOADS /login again (a full page load): the server then
 * reads the new session and redirects to the user's area (see page.tsx). The browser never decides
 * the area itself.
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
import { PasswordField, TextField } from "@/components/domain/form/text-field";
import { authClient } from "@/lib/auth-client";
import {
  fieldErrorKey,
  signInErrorKey,
  type FormErrorKey,
} from "@/lib/auth/form-errors";
import { loginSchema, type LoginInput } from "@/lib/schemas/login";

const FIELDS = ["email", "password"] as const;

export function LoginForm() {
  const t = useTranslations();
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
    // Focus goes to the error summary instead of the first invalid field.
    shouldFocusError: false,
    defaultValues: { email: "", password: "" },
  });
  const { focusRequest, focus: focusSummary } = useErrorSummary();
  const [formError, setFormError] = useState<FormErrorKey | null>(null);
  // Stays true after a successful sign-in, so the button is disabled until the next page loads.
  const [redirecting, setRedirecting] = useState(false);
  // Blocks a second submit that arrives before React has disabled the button.
  const busy = useRef(false);

  const errorText = (name: (typeof FIELDS)[number]) => {
    const error = errors[name];
    return error
      ? t(fieldErrorKey(name, getValues(name), error.type))
      : undefined;
  };

  async function onValid(values: LoginInput) {
    if (busy.current) return;
    busy.current = true;
    setFormError(null);
    const { error } = await authClient.signIn
      .email({ email: values.email, password: values.password })
      .catch(() => ({ error: {} })); // network failure → the generic message
    if (error) {
      busy.current = false;
      setFormError(signInErrorKey(error));
      focusSummary();
      return;
    }
    setRedirecting(true);
    // Deliberately a full page load, not router.push(): see the comment at the top.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
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
      <ErrorSummary
        focusRequest={focusRequest}
        title={t("auth.errors.summaryTitle")}
        message={formError ? t(formError) : undefined}
        items={FIELDS.flatMap((name) => {
          const text = errorText(name);
          return text ? [{ id: name, text }] : [];
        })}
      />
      <TextField
        id="email"
        label={t("auth.fields.email.label")}
        type="email"
        autoComplete="email"
        required
        error={errorText("email")}
        {...register("email")}
      />
      <PasswordField
        id="password"
        label={t("auth.fields.password.label")}
        autoComplete="current-password"
        required
        error={errorText("password")}
        {...register("password")}
      />
      <SubmitButton
        pending={isSubmitting || redirecting}
        label={t("auth.login.submit")}
        pendingLabel={t("auth.login.submitting")}
      />
    </form>
  );
}
