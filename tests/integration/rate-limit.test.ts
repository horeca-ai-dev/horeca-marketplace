/**
 * Sign-in rate limit per client IP (D2-B2) — the G0 check "failed logins from two networks are
 * counted separately". The limiter is on by default only in production, so this test builds its own
 * Better Auth instance with it switched on.
 */
import { afterAll, describe, expect, it } from "vitest";
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
});
