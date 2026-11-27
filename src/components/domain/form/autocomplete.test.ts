/**
 * The auth forms carry the right `autocomplete` tokens in the server-rendered HTML (password
 * managers and autofill depend on them; the production smoke test looks for current-password).
 *
 * React 19 writes the attribute as `autoComplete="…"` (camelCase). HTML attribute names are
 * case-insensitive, so browsers read it as `autocomplete` — the checks below match the name
 * case-insensitively, as a browser does.
 */
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";
import messages from "../../../../messages/sr-Latn-ME.json";

// The register form calls Server Actions; their module pulls in the server (env, database).
vi.mock("@/server/actions/registration", () => ({
  registerCompanyAction: vi.fn(),
  completeCompanySetupAction: vi.fn(),
}));

const { LoginForm } = await import("@/app/(public)/login/login-form");
const { RegisterForm } = await import("@/app/(public)/register/register-form");

function render(component: ComponentType) {
  // The provider's props type requires `children`, so it goes in the props object.
  const props = {
    locale: "sr-Latn-ME",
    messages,
    children: createElement(component),
  } as const;
  return renderToStaticMarkup(createElement(NextIntlClientProvider, props));
}

/** name → autocomplete token of every <input> in the markup (attribute names case-insensitive). */
function autocompleteByName(html: string): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [tag] of html.matchAll(/<input\b[^>]*>/gi)) {
    const name = /\sname="([^"]*)"/i.exec(tag)?.[1];
    if (name) result[name] = /\sautocomplete="([^"]*)"/i.exec(tag)?.[1];
  }
  return result;
}

describe("auth forms: autocomplete attributes", () => {
  test("login", () => {
    expect(autocompleteByName(render(LoginForm))).toEqual({
      email: "email",
      password: "current-password",
    });
  });

  test("register", () => {
    expect(autocompleteByName(render(RegisterForm))).toEqual({
      "account.name": "name",
      "account.email": "email",
      "account.password": "new-password",
      "company.legalName": "organization",
      "company.taxId": "off",
      "company.addressLine": "street-address",
      "company.city": "address-level2",
      "company.postalCode": "postal-code",
      "company.contactEmail": "email",
      "company.contactPhone": "tel",
    });
  });

  test("the login password field is in the HTML the smoke test greps (case-insensitive)", () => {
    expect(render(LoginForm)).toMatch(/autocomplete="current-password"/i);
  });
});
