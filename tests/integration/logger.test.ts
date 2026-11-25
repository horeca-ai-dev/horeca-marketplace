/**
 * The logger against a REAL Drizzle query error (D3-B3). The unit test uses a hand-made message; this
 * proves the real error shape — which carries the bound parameter values — is scrubbed too.
 */
import { Writable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { withSystemTx } from "@/server/db/tx";
import { createLogger } from "@/server/logger";

afterAll(async () => {
  await closeDb();
});

describe("logging a failed query", () => {
  it("keeps the SQL but never the parameter values", async () => {
    const lines: string[] = [];
    const log = createLogger({
      level: "info",
      destination: new Writable({
        write(chunk: Buffer, _encoding, done) {
          lines.push(chunk.toString());
          done();
        },
      }),
    });

    // The worker login may only SELECT from "user": the insert is refused, with our values as parameters.
    const error = await withSystemTx((tx) =>
      tx.insert(user).values({
        id: "log_test_id",
        name: "Secret Person",
        email: "secret-person@example.test",
      }),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).not.toBeNull();
    // Without the scrubbing the values really are in the raw error — otherwise this test proves nothing.
    expect(String((error as Error).message)).toContain(
      "secret-person@example.test",
    );

    log.error({ err: error }, "insert failed");
    const text = lines.join("");
    expect(text).toContain('insert into \\"user\\"'); // the SQL stays
    expect(text).not.toContain("secret-person@example.test");
    expect(text).not.toContain("Secret Person");
  });
});
