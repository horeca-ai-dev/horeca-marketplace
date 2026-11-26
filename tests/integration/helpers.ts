/** Small helpers shared by the database tests. */
import { expect } from "vitest";

/** The Postgres error behind a Drizzle error (Drizzle wraps the driver's error in `cause`). */
export function pgError(e: unknown): { code?: string; constraint?: string } {
  const err = e as { cause?: object } & object;
  return (err.cause ?? err) as { code?: string; constraint?: string };
}

async function failure(fn: () => Promise<unknown>): Promise<unknown> {
  return fn().then(
    () => null,
    (e: unknown) => e,
  );
}

/** `fn` must fail by violating exactly this named constraint or unique index. */
export async function rejected(constraint: string, fn: () => Promise<unknown>) {
  const error = await failure(fn);
  expect(error, `expected ${constraint} to reject`).not.toBeNull();
  expect(pgError(error).constraint).toBe(constraint);
}

/** `fn` must fail with this SQLSTATE: 42501 = insufficient privilege (a missing grant), 23502 = NOT NULL. */
export async function failsWith(code: string, fn: () => Promise<unknown>) {
  const error = await failure(fn);
  expect(error, `expected SQLSTATE ${code}`).not.toBeNull();
  expect(pgError(error).code).toBe(code);
}
