import { afterEach, describe, expect, it, vi } from "vitest";
import { assertEnv, env } from "./env.core";

const SECRET = "postgresql://horeca_owner:very-secret-pw@db:5432/horeca";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("assertEnv", () => {
  it("lists every missing key of the role in one error", () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("SMTP_URL", "");
    vi.stubEnv("EMAIL_FROM", "");
    expect(() => assertEnv("worker")).toThrow(/SMTP_URL is not set/);
    expect(() => assertEnv("worker")).toThrow(/EMAIL_FROM is not set/);
  });

  it("passes for migrate with only the owner URL, and never prints values", () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("DATABASE_MIGRATE_URL", SECRET);
    expect(() => assertEnv("migrate")).not.toThrow();

    vi.stubEnv("DATABASE_MIGRATE_URL", "http://x:very-secret-pw@db");
    let message = "";
    try {
      assertEnv("migrate");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/DATABASE_MIGRATE_URL/);
    expect(message).not.toMatch(/very-secret-pw/);
  });

  it("requires the Claude API settings only when AI is enabled", () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("AI_ENABLED", "true");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => assertEnv("web")).toThrow(/ANTHROPIC_API_KEY is not set/);
  });

  it("is skipped by the build-time switch and during next build", () => {
    vi.stubEnv("DATABASE_MIGRATE_URL", "");
    vi.stubEnv("SKIP_ENV_VALIDATION", "1");
    expect(() => assertEnv("migrate")).not.toThrow();
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect(() => assertEnv("migrate")).not.toThrow();
  });
});

describe("env getters", () => {
  it("apply defaults and reject typos in flags", () => {
    vi.stubEnv("REGISTRATION_OPEN", "");
    vi.stubEnv("MIGRATIONS_DIR", "");
    expect(env.REGISTRATION_OPEN).toBe(false);
    expect(env.MIGRATIONS_DIR).toBe("src/server/db/migrations");
    vi.stubEnv("REGISTRATION_OPEN", "ture");
    expect(() => env.REGISTRATION_OPEN).toThrow(/REGISTRATION_OPEN/);
  });

  it("throw when a required key is read but unset", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => env.DATABASE_URL).toThrow(/DATABASE_URL is not set/);
    expect(env.has("DATABASE_URL")).toBe(false);
  });
});

describe("S3 media storage variables (decision 013)", () => {
  const S3 = {
    S3_ENDPOINT: "http://garage:3900",
    S3_REGION: "garage",
    S3_BUCKET: "horeca-media",
    S3_ACCESS_KEY_ID: "GK0123456789abcdef01234567",
    S3_SECRET_ACCESS_KEY: "s3cr3t-s3cr3t-s3cr3t-s3cr3t-s3cr3t-s3cr3t",
  };
  const stubAll = (over: Record<string, string> = {}) => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    vi.stubEnv("NEXT_PHASE", "");
    for (const [k, v] of Object.entries({ ...S3, ...over })) vi.stubEnv(k, v);
  };
  const problems = (role: "web" | "worker") => {
    try {
      assertEnv(role);
    } catch (err) {
      return (err as Error).message;
    }
    return "";
  };

  it.each(["web", "worker"] as const)(
    "%s needs every S3 key and names the missing ones",
    (role) => {
      stubAll({
        S3_ENDPOINT: "",
        S3_ACCESS_KEY_ID: "",
        S3_SECRET_ACCESS_KEY: "",
      });
      const message = problems(role);
      expect(message).toMatch(/S3_ENDPOINT is not set/);
      expect(message).toMatch(/S3_ACCESS_KEY_ID is not set/);
      expect(message).toMatch(/S3_SECRET_ACCESS_KEY is not set/);
    },
  );

  it("migrate does not need them", () => {
    stubAll({ S3_ENDPOINT: "", S3_BUCKET: "" });
    vi.stubEnv("DATABASE_MIGRATE_URL", SECRET);
    expect(() => assertEnv("migrate")).not.toThrow();
  });

  it.each(["ab", "Horeca-Media", "-media", "media-", "has space", "a_b_c"])(
    "rejects the bucket name %j",
    (bucket) => {
      stubAll({ S3_BUCKET: bucket });
      expect(problems("web")).toMatch(
        /S3_BUCKET is not a valid S3 bucket name/,
      );
    },
  );

  it("rejects an endpoint that is not a URL, and never prints the secret key", () => {
    stubAll({ S3_ENDPOINT: "garage:3900" });
    const message = problems("worker");
    expect(message).toMatch(/S3_ENDPOINT/);
    expect(message).not.toContain(S3.S3_SECRET_ACCESS_KEY);
    expect(message).not.toContain(S3.S3_ACCESS_KEY_ID);
  });

  it('path-style is on by default (Garage) and only an explicit "false" turns it off', () => {
    stubAll();
    vi.stubEnv("S3_FORCE_PATH_STYLE", "");
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    vi.stubEnv("S3_FORCE_PATH_STYLE", "false");
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
    vi.stubEnv("S3_FORCE_PATH_STYLE", "flase");
    expect(problems("web")).toMatch(/S3_FORCE_PATH_STYLE/);
  });

  it("MEDIA_DIR is gone: nothing asks for it any more", () => {
    stubAll();
    vi.stubEnv("MEDIA_DIR", "");
    expect(problems("web")).not.toMatch(/MEDIA_DIR/);
  });
});
