"use client";

/**
 * Bank details on /supplier/company (D5-A3; matrix: supplierProfile.viewBankDetails /
 * .updateBankDetails — the supplier's OWNER only).
 *
 * The page decides with policy.can and passes either the IBAN (owner) or nothing (member). A member
 * gets only the sentence "Samo vlasnik firme može vidjeti bankovne podatke." — the IBAN is never read
 * for them, so it is never in the page.
 *
 * The owner changes the IBAN inline (one field). The shared ibanSchema accepts spaces and lower case
 * and checks the Montenegrin format and the mod-97 check digits — in the browser and again on the server.
 */
import { useRef, useState } from "react";
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
import { loadPage } from "@/lib/auth/load-page";
import {
  companyFieldErrorKey,
  groupIban,
  mapCompanyActionError,
  type CompanyFormErrorKey,
} from "@/lib/company/form-errors";
import {
  updateBankDetailsSchema,
  type UpdateBankDetailsInput,
} from "@/lib/schemas/company";
import { updateBankDetailsAction } from "@/server/actions/company";

const IBAN_ID = "bank-iban";

export function BankDetails(
  props: { canView: true; iban: string | null } | { canView: false },
) {
  const t = useTranslations();
  const [editing, setEditing] = useState(false);

  return (
    <section
      aria-labelledby="bank-heading"
      className="mt-8 flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="bank-heading" className="text-xl">
          {t("company.bank.heading")}
        </h2>
        {props.canView && !editing ? (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {props.iban ? t("company.bank.edit") : t("company.bank.add")}
          </Button>
        ) : null}
      </div>
      {!props.canView ? (
        <p className="text-base text-muted-foreground">
          {t("company.bank.ownerOnly")}
        </p>
      ) : (
        <>
          <p className="max-w-[70ch] text-sm text-muted-foreground">
            {t("company.bank.description")}
          </p>
          {editing ? (
            <IbanForm iban={props.iban} onDone={() => setEditing(false)} />
          ) : (
            <dl className="max-w-3xl">
              <div className="grid gap-1 border-b border-border py-2 sm:grid-cols-[14rem_1fr] sm:gap-4">
                <dt className="text-sm text-muted-foreground">
                  {t("company.bank.iban")}
                </dt>
                <dd className="text-base">
                  {props.iban ? (
                    groupIban(props.iban)
                  ) : (
                    <span className="text-muted-foreground">
                      {t("company.bank.none")}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          )}
        </>
      )}
    </section>
  );
}

function IbanForm({
  iban,
  onDone,
}: {
  iban: string | null;
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
  } = useForm<
    UpdateBankDetailsInput,
    unknown,
    z.output<typeof updateBankDetailsSchema>
  >({
    resolver: zodResolver(updateBankDetailsSchema),
    mode: "onBlur",
    shouldFocusError: false,
    defaultValues: { iban: iban ? groupIban(iban) : "" },
  });
  const { focusRequest, focus: focusSummary } = useErrorSummary();
  const [formError, setFormError] = useState<CompanyFormErrorKey | null>(null);
  const [leaving, setLeaving] = useState(false);
  const busy = useRef(false);

  const errorText = errors.iban
    ? t(companyFieldErrorKey("iban", getValues("iban")))
    : undefined;

  async function onValid(values: z.output<typeof updateBankDetailsSchema>) {
    if (busy.current) return;
    busy.current = true;
    setFormError(null);

    const result = await updateBankDetailsAction(values).catch(() => undefined);
    if (result?.data) {
      busy.current = false;
      notify.success(t("company.bank.saved"));
      onDone();
      router.refresh();
      return;
    }
    const failure = mapCompanyActionError(result);
    if (failure.kind === "unauthenticated") {
      setLeaving(true);
      loadPage("/login");
      return;
    }
    // One field: any input rejection is about the IBAN.
    if (failure.kind === "fields") setError("iban", { type: "server" });
    busy.current = false;
    setFormError(failure.formKey);
    focusSummary();
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
        items={errorText ? [{ id: IBAN_ID, text: errorText }] : []}
      />
      <TextField
        id={IBAN_ID}
        {...register("iban")}
        error={errorText}
        label={t("company.bank.iban")}
        help={t("company.bank.ibanHelp")}
        autoComplete="off"
        spellCheck={false}
        required
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <SubmitButton
          pending={isSubmitting || leaving}
          label={t("company.bank.submit")}
          pendingLabel={t("company.bank.submitting")}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={isSubmitting || leaving}
          onClick={onDone}
        >
          {t("company.bank.cancel")}
        </Button>
      </div>
    </form>
  );
}
