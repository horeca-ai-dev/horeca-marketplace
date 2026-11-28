/**
 * Every form that can hold credentials or personal data says method="post" in its server-rendered HTML.
 *
 * Why: until the JavaScript bundle has loaded (slow network, a blocked script, the dev server opened
 * through a LAN address), React's onSubmit does not exist and the browser submits the form natively.
 * Without a method that is a GET — e-mail, password, IBAN… end up in the URL, the history and server
 * logs. With method="post" the same accident sends a request body instead.
 */
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import messages from "../../../../messages/sr-Latn-ME.json";

// Server Action modules pull in the server (env, database); the forms only need the names.
vi.mock("@/server/actions/registration", () => ({
  registerCompanyAction: vi.fn(),
  completeCompanySetupAction: vi.fn(),
}));
vi.mock("@/server/actions/company", () => ({
  updateOrgProfileAction: vi.fn(),
  createLocationAction: vi.fn(),
  updateLocationAction: vi.fn(),
  archiveLocationAction: vi.fn(),
  updateBankDetailsAction: vi.fn(),
}));
// The company forms refresh the page after saving; rendering never calls it.
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

const { LoginForm } = await import("@/app/(public)/login/login-form");
const { RegisterForm } = await import("@/app/(public)/register/register-form");
const { CompanyForm } =
  await import("@/app/(public)/complete-setup/company-form");
const { ForgotPasswordForm } =
  await import("@/app/(public)/forgot-password/forgot-password-form");
const { ResetPasswordForm } =
  await import("@/app/(public)/reset-password/reset-password-form");
const { ProfileForm } =
  await import("@/components/domain/company/company-profile");
const { LocationForm } = await import("@/app/buyer/company/location-form");
const { IbanForm } = await import("@/app/supplier/company/bank-details");

function render(component: ComponentType) {
  const props = {
    locale: "sr-Latn-ME",
    messages,
    children: createElement(component),
  } as const;
  return renderToStaticMarkup(createElement(NextIntlClientProvider, props));
}

/** The method of every <form> in the markup (attribute names are case-insensitive in HTML). */
function formMethods(html: string): (string | undefined)[] {
  return [...html.matchAll(/<form\b[^>]*>/gi)].map(([tag]) =>
    /\smethod="([^"]*)"/i.exec(tag)?.[1]?.toLowerCase(),
  );
}

const profile = {
  legalName: "Hotel Adriatik d.o.o.",
  taxId: "02000005",
  vatNumber: null,
  addressLine: "Jadranski put 1",
  city: "Budva",
  postalCode: "85310",
  contactEmail: "nabavka@hotel.example",
  contactPhone: null,
};

const FORMS: [string, ComponentType][] = [
  ["login", LoginForm],
  ["register", RegisterForm],
  ["complete setup", () => createElement(CompanyForm, { userId: "u1" })],
  ["forgot password", ForgotPasswordForm],
  ["reset password", () => createElement(ResetPasswordForm, { token: "t" })],
  [
    "company profile",
    () => createElement(ProfileForm, { profile, onDone: () => {} }),
  ],
  ["new location", () => createElement(LocationForm, { onSaved: () => {} })],
  [
    "bank details",
    () =>
      createElement(IbanForm, {
        iban: "ME25505000012345678951",
        onDone: () => {},
      }),
  ],
];

describe("forms with credentials or personal data use method=post", () => {
  test.each(FORMS)("%s", (_name, component) => {
    const methods = formMethods(render(component));
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((m) => m === "post")).toBe(true);
  });
});
