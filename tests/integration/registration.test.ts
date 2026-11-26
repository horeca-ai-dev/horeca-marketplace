/**
 * Registration and the Better Auth lockdown against a real database (D2-B2).
 * Needs the migrations applied (`pnpm db:migrate`) and .env from .env.example.
 */
import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  registrationSchema,
  type RegistrationInput,
} from "@/lib/schemas/registration";
import { getAuth } from "@/server/auth/auth";
import {
  completeCompanySetup,
  registerCompany,
} from "@/server/auth/registration";
import { closeDb } from "@/server/db/client";
import {
  member,
  orgProfiles,
  session,
  supplierProfiles,
} from "@/server/db/schema";
import { withSystemTx } from "@/server/db/tx";
import { Conflict, Forbidden } from "@/server/domain/errors";

const run = Date.now().toString(36);
let n = 0;
const taxId = () => String(randomInt(10_000_000, 100_000_000));
const PASSWORD = "Test-password-123";
const ORIGIN = "http://localhost:3000";

function input(
  overrides: Partial<RegistrationInput["company"]> = {},
): RegistrationInput {
  n += 1;
  const email = `reg-${run}-${n}@example.test`;
  return {
    account: { name: "Test Owner", email, password: PASSWORD },
    company: {
      legalName: `Test buyer ${n} d.o.o.`,
      taxId: taxId(),
      addressLine: "Njegoševa 1",
      city: "Podgorica",
      postalCode: "81000",
      contactEmail: email,
      ...overrides,
    },
  };
}

/** Reads as the worker login (no RLS involved yet): what really ended up in the tables. */
const read = <T>(fn: Parameters<typeof withSystemTx<T>>[0]) => withSystemTx(fn);

/** The Conflict a call fails with (fails the test if it succeeds or throws something else). */
async function conflictOf(promise: Promise<unknown>): Promise<Conflict> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(Conflict);
  return error as Conflict;
}

/** A request to Better Auth's HTTP API, as the browser (or the G0 curl script) would send it. */
function http(path: string, body: unknown, cookie?: string) {
  return getAuth().handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}
const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";", 1)[0])
    .join("; ");

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await closeDb();
});

describe("registerCompany", () => {
  it("buyer: user + organization + owner member + approved profile, session in the new organization", async () => {
    vi.stubEnv("REGISTRATION_OPEN", "true");
    const reg = await registerCompany(input());
    expect(reg).toMatchObject({ type: "buyer", status: "approved" });
    expect(reg.organizationId).toMatch(/^[A-Za-z0-9]{32}$/);

    const [m] = await read((tx) =>
      tx
        .select()
        .from(member)
        .where(eq(member.organizationId, reg.organizationId)),
    );
    expect(m).toMatchObject({ userId: reg.userId, role: "owner" });
    const sessions = await read((tx) =>
      tx.select().from(session).where(eq(session.userId, reg.userId)),
    );
    expect(sessions.map((s) => s.activeOrganizationId)).toEqual([
      reg.organizationId,
    ]);
  });

  it("registration is buyer-only: no supplier_profiles row, and a `type` field is rejected", async () => {
    vi.stubEnv("REGISTRATION_OPEN", "true");
    const reg = await registerCompany(input());
    const sp = await read((tx) =>
      tx
        .select()
        .from(supplierProfiles)
        .where(eq(supplierProfiles.organizationId, reg.organizationId)),
    );
    expect(sp).toHaveLength(0);
    // Decision 012: suppliers are created by the admin. The form contract has no `type` field.
    const data = input();
    const parsed = registrationSchema.safeParse({
      ...data,
      company: { ...data.company, type: "supplier" },
    });
    expect(parsed.success).toBe(false);
  });

  it("same tax ID twice → Conflict; the second user is left without organization", async () => {
    vi.stubEnv("REGISTRATION_OPEN", "true");
    const first = input();
    await registerCompany(first);
    const second = input({ taxId: first.company.taxId });
    expect(await conflictOf(registerCompany(second))).toMatchObject({
      reason: "TAX_ID_TAKEN",
    });

    // The rolled-back transaction left no profile, organization or membership for that tax ID's second user.
    const profiles = await read((tx) =>
      tx
        .select()
        .from(orgProfiles)
        .where(
          and(
            eq(orgProfiles.taxId, first.company.taxId),
            eq(orgProfiles.type, "buyer"),
          ),
        ),
    );
    expect(profiles).toHaveLength(1);

    // "Complete company setup": that user logs in (no active organization) and retries with a new tax ID.
    const login = await http("/sign-in/email", {
      email: second.account.email,
      password: PASSWORD,
    });
    expect(login.status).toBe(200);
    const { user } = (await login.json()) as { user: { id: string } };
    const reg = await completeCompanySetup(
      user.id,
      new Headers({ cookie: cookieOf(login) }),
      {
        ...second.company,
        taxId: taxId(),
      },
    );
    expect(reg.type).toBe("buyer");
  });

  it("the same e-mail twice → Conflict", async () => {
    vi.stubEnv("REGISTRATION_OPEN", "true");
    const first = input();
    await registerCompany(first);
    const error = await conflictOf(
      registerCompany({ ...input(), account: first.account }),
    );
    expect(error.reason).toBe("EMAIL_TAKEN");
  });

  it("a user who already has a company cannot create a second one", async () => {
    vi.stubEnv("REGISTRATION_OPEN", "true");
    const first = input();
    const reg = await registerCompany(first);
    const login = await http("/sign-in/email", {
      email: first.account.email,
      password: PASSWORD,
    });
    const error = await conflictOf(
      completeCompanySetup(
        reg.userId,
        new Headers({ cookie: cookieOf(login) }),
        input().company,
      ),
    );
    expect(error.reason).toBe("ALREADY_HAS_COMPANY");
  });

  it("REGISTRATION_OPEN=false → Forbidden, nothing is created", async () => {
    vi.stubEnv("REGISTRATION_OPEN", "false");
    await expect(registerCompany(input())).rejects.toThrow(Forbidden);
  });
});

describe("sessions", () => {
  it("a later login starts in the user's organization (databaseHooks.session.create)", async () => {
    vi.stubEnv("REGISTRATION_OPEN", "true");
    const data = input();
    const reg = await registerCompany(data);
    const login = await http("/sign-in/email", {
      email: data.account.email,
      password: PASSWORD,
    });
    const res = await getAuth().api.getSession({
      headers: new Headers({ cookie: cookieOf(login) }),
    });
    expect(res?.session.activeOrganizationId).toBe(reg.organizationId);
  });
});

describe("Better Auth lockdown (HTTP)", () => {
  it("sign-up over HTTP works while registration is open (the G0 curl script uses it)", async () => {
    vi.stubEnv("REGISTRATION_OPEN", "true");
    const data = input();
    const res = await http("/sign-up/email", data.account);
    expect(res.status).toBe(200);
  });

  it("sign-up over HTTP is refused when REGISTRATION_OPEN=false", async () => {
    vi.stubEnv("REGISTRATION_OPEN", "false");
    const res = await http("/sign-up/email", input().account);
    expect(res.status).toBe(403);
  });

  it.each([
    "/organization/create",
    "/organization/update",
    "/organization/delete",
    "/organization/invite-member",
    "/organization/remove-member",
    "/organization/update-member-role",
    "/organization/leave",
    "/organization/accept-invitation",
  ])("%s is refused (404)", async (path) => {
    vi.stubEnv("REGISTRATION_OPEN", "true");
    const data = input();
    await registerCompany(data);
    const login = await http("/sign-in/email", {
      email: data.account.email,
      password: PASSWORD,
    });
    const res = await http(
      path,
      { name: "x", slug: "x", email: "x@example.test", role: "member" },
      cookieOf(login),
    );
    expect(res.status).toBe(404);
  });

  it("set-active is allowed for an own organization, refused for a foreign one", async () => {
    vi.stubEnv("REGISTRATION_OPEN", "true");
    const mine = input();
    const regMine = await registerCompany(mine);
    const regOther = await registerCompany(input());
    const login = await http("/sign-in/email", {
      email: mine.account.email,
      password: PASSWORD,
    });
    const own = await http(
      "/organization/set-active",
      { organizationId: regMine.organizationId },
      cookieOf(login),
    );
    expect(own.status).toBe(200);
    const foreign = await http(
      "/organization/set-active",
      { organizationId: regOther.organizationId },
      cookieOf(login),
    );
    expect(foreign.status).toBeGreaterThanOrEqual(400);
  });

  it("a logged-in user's request from a foreign origin is refused (CSRF, trustedOrigins)", async () => {
    vi.stubEnv("REGISTRATION_OPEN", "true");
    const data = input();
    const reg = await registerCompany(data);
    const login = await http("/sign-in/email", {
      email: data.account.email,
      password: PASSWORD,
    });
    const res = await getAuth().handler(
      new Request(`${ORIGIN}/api/auth/organization/set-active`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
          cookie: cookieOf(login),
        },
        body: JSON.stringify({ organizationId: reg.organizationId }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
