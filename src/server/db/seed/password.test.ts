import { describe, expect, it } from "vitest";
import { README_DEMO_PASSWORD, resolveSeedPassword } from "./password";

describe("resolveSeedPassword", () => {
  it.each(["local", "staging"] as const)(
    "%s: uses the configured password, else the README's",
    (appEnv) => {
      expect(resolveSeedPassword(appEnv, "something-else-123")).toBe(
        "something-else-123",
      );
      expect(resolveSeedPassword(appEnv, undefined)).toBe(README_DEMO_PASSWORD);
    },
  );

  it("production: accepts a real password", () => {
    expect(resolveSeedPassword("production", "a-long-private-secret")).toBe(
      "a-long-private-secret",
    );
  });

  it.each([
    ["no password", undefined, /not set/],
    ["the README password", README_DEMO_PASSWORD, /README/],
    ["a short password", "short-pw-1!", /at least 12/],
  ])("production: refuses %s", (_name, password, message) => {
    expect(() => resolveSeedPassword("production", password)).toThrow(message);
  });

  it("never puts the password into the error message", () => {
    let message = "";
    try {
      resolveSeedPassword("production", "tooShort1!");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("tooShort1!");
  });
});
