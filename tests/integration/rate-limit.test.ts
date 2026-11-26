/**
 * Sign-in rate limit per client IP (D2-B2) — the G0 check "failed logins from two networks are
 * counted separately". The limiter is on by default only in production, so this test builds its own
 * Better Auth instance with it switched on.
 */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createAuth } from "@/server/auth/auth";
import { closeDb } from "@/server/db/client";

const ORIGIN = "http://localhost:3000";
const auth = createAuth({ rateLimit: true });

function signIn(clientIp: string) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        "x-real-ip": clientIp,
      },
      body: JSON.stringify({
        email: `nobody-${Date.now()}@example.test`,
        password: "wrong-password-123",
      }),
    }),
  );
}

/** Sign-in through an instance built the way getAuth() builds it (no override), N times from one IP. */
async function statusesFromDefaultInstance(clientIp: string, times: number) {
  const defaultAuth = createAuth();
  const statuses: number[] = [];
  for (let attempt = 0; attempt < times; attempt++) {
    const response = await defaultAuth.handler(
      new Request(`${ORIGIN}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          "x-real-ip": clientIp,
        },
        body: JSON.stringify({
          email: `nobody-${Date.now()}@example.test`,
          password: "wrong-password-123",
        }),
      }),
    );
    statuses.push(response.status);
  }
  return statuses;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await closeDb();
});

describe("sign-in rate limit", () => {
  it("allows 5 failed sign-ins per minute per IP, then answers 429 — and another IP is not affected", async () => {
    // Unique IPs per run: the limiter's memory lives as long as this test process.
    const networkA = `198.51.100.${(Date.now() % 200) + 1}`;
    const networkB = `203.0.113.${(Date.now() % 200) + 1}`;

    for (let attempt = 1; attempt <= 5; attempt++) {
      expect((await signIn(networkA)).status).toBe(401); // wrong credentials, not limited yet
    }
    expect((await signIn(networkA)).status).toBe(429); // 6th attempt from network A is blocked
    expect((await signIn(networkB)).status).toBe(401); // network B has its own counter
  });

  // The default path (what runs on staging/production): nobody switches the limiter on by hand, and
  // NODE_ENV stays "test" — so only APP_ENV can be what turns it on.
  it.each([
    ["staging", "192.0.2"],
    ["production", "198.18.0"],
  ] as const)(
    "is on by itself when APP_ENV=%s, whatever NODE_ENV says",
    async (appEnv, subnet) => {
      vi.stubEnv("APP_ENV", appEnv);
      const ip = `${subnet}.${(Date.now() % 200) + 1}`;
      expect(await statusesFromDefaultInstance(ip, 6)).toEqual([
        401, 401, 401, 401, 401, 429,
      ]);
    },
  );

  it("is off for local work (APP_ENV=local): no 429 however many wrong sign-ins", async () => {
    vi.stubEnv("APP_ENV", "local");
    const ip = `198.19.0.${(Date.now() % 200) + 1}`;
    expect(await statusesFromDefaultInstance(ip, 6)).toEqual([
      401, 401, 401, 401, 401, 401,
    ]);
  });
});
