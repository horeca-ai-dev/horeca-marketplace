import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// notFound() / redirect() throw in Next.js; the mocks throw recognisable errors instead.
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

import { decodePageErrorDigest } from "@/lib/page-error-digest";
import {
  Conflict,
  Forbidden,
  NotFound,
  Unauthenticated,
  Validation,
} from "@/server/domain/errors";
import { loadPage } from "./load-page";

const failWith = (error: unknown) => () => Promise.reject(error);

/** The digest error.tsx will receive, or undefined when the error has none. */
async function digestOf(load: () => Promise<unknown>) {
  const error = await loadPage(load).catch((e: unknown) => e);
  return decodePageErrorDigest(
    (error as { digest?: string } | undefined)?.digest,
  );
}

describe("loadPage", () => {
  it("returns the data", async () => {
    await expect(loadPage(async () => 42)).resolves.toEqual({
      ok: true,
      data: 42,
    });
  });

  it("NotFound → notFound()", async () => {
    await expect(loadPage(failWith(new NotFound()))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("Unauthenticated → redirect to /login", async () => {
    await expect(loadPage(failWith(new Unauthenticated()))).rejects.toThrow(
      "NEXT_REDIRECT /login",
    );
  });

  it("Forbidden → { ok: false } so the page renders ForbiddenPage in place", async () => {
    await expect(loadPage(failWith(new Forbidden()))).resolves.toEqual({
      ok: false,
    });
  });

  it("Conflict → digest with its reason", async () => {
    expect(
      await digestOf(
        failWith(new Conflict("taken", { reason: "TAX_ID_TAKEN" })),
      ),
    ).toEqual({ code: "CONFLICT", reason: "TAX_ID_TAKEN" });
  });

  it("Conflict without a reason → digest without one", async () => {
    expect(await digestOf(failWith(new Conflict("changed")))).toEqual({
      code: "CONFLICT",
    });
  });

  it("Validation → digest", async () => {
    expect(await digestOf(failWith(new Validation()))).toEqual({
      code: "VALIDATION",
    });
  });

  it("rethrows anything else unchanged (and its message never becomes a digest)", async () => {
    const boom = new Error("connection refused");
    await expect(loadPage(failWith(boom))).rejects.toBe(boom);
  });
});
