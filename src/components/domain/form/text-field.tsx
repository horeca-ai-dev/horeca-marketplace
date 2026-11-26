"use client";

/**
 * One form field (DESIGN.md → Components, "Input"): label above, optional help, the control, and
 * the error under it (icon + text in --negative-text).
 *
 * Accessibility: the label is tied to the control by `id`; help and error are tied by
 * `aria-describedby`; the error sits in an `aria-live="polite"` region that is always in the page,
 * so a message that appears on blur is announced.
 *
 * Works with React Hook Form: spread `register("name")` into it (name, onChange, onBlur, ref).
 */
import { useState, type ComponentProps, type ReactNode } from "react";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  id: string;
  label: string;
  help?: string;
  /** The message to show; undefined = the field is fine. */
  error?: string;
  /** Rendered over the end of the control (the password field's show / hide button). */
  trailing?: ReactNode;
};

export function TextField({
  id,
  label,
  help,
  error,
  trailing,
  ...input
}: TextFieldProps) {
  const describedBy = [help && `${id}-help`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {help ? (
        <p id={`${id}-help`} className="text-sm text-muted-foreground">
          {help}
        </p>
      ) : null}
      <div className="relative">
        <Input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          {...input}
        />
        {trailing}
      </div>
      <div aria-live="polite">
        {error ? (
          <p
            id={`${id}-error`}
            className="flex items-start gap-1 text-sm text-negative-text"
          >
            <Icon icon={CircleAlert} size={16} className="mt-0.5" />
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** A password field with a show / hide button (a real button: keyboard and screen-reader usable). */
export function PasswordField({
  className,
  ...props
}: Omit<TextFieldProps, "type" | "trailing">) {
  const t = useTranslations("auth.fields.password");
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      // Room for the button, which is as wide as the control is high.
      className={cn("pr-(--control-h)", className)}
      trailing={
        <button
          type="button"
          aria-label={visible ? t("hide") : t("show")}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-(--control-h) items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
        >
          <Icon icon={visible ? EyeOff : Eye} />
        </button>
      }
    />
  );
}
