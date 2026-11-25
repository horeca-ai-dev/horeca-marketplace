import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, serializeError } from "./logger";

/** A logger whose lines can be read back as parsed JSON. */
function capture(level = "info") {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return {
    log: createLogger({ level, destination }),
    lines,
    parsed: () => lines.map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

describe("logger", () => {
  it("writes one JSON line with a readable level, a timestamp and our fields", () => {
    const { log, parsed } = capture();
    log.child({ component: "worker" }).info({ jobId: "j1" }, "started");
    expect(parsed()).toEqual([
      expect.objectContaining({
        level: "info",
        component: "worker",
        jobId: "j1",
        msg: "started",
        time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown,
      }),
    ]);
  });

  it("honours the level", () => {
    const { log, lines } = capture("warn");
    log.info("hidden");
    log.warn("shown");
    expect(lines).toHaveLength(1);
  });

  it("blanks secrets at the top level, one level down and in request headers", () => {
    const { log, lines } = capture();
    log.info(
      {
        password: "p1",
        user: { token: "t1", name: "Ana" },
        req: { headers: { cookie: "c1", authorization: "a1", host: "h" } },
      },
      "sensitive",
    );
    const text = lines.join("");
    for (const secret of ["p1", "t1", "c1", "a1"])
      expect(text).not.toContain(`"${secret}"`);
    expect(text).toContain("Ana"); // other fields are untouched
    expect(text).toContain('"host":"h"');
    expect(text).toContain("[redacted]");
  });

  it("logs an error with its type, message and stack under `err`", () => {
    const { log, parsed } = capture();
    log.error({ err: new TypeError("boom") }, "failed");
    const err = parsed()[0]!.err as Record<string, string>;
    expect(err.type).toBe("TypeError");
    expect(err.message).toBe("boom");
    expect(err.stack).toContain("TypeError: boom");
  });

  it("never logs the parameter values of a failed query, not even in a cause", () => {
    const { log, lines } = capture();
    const query =
      "Failed query: insert into user (email) values ($1)\nparams: ana@example.test,hash-123";
    const error = new Error(query, {
      cause: new Error(`${query}\nmore`),
    });
    log.error({ err: error }, "insert failed");
    const text = lines.join("");
    expect(text).not.toContain("ana@example.test");
    expect(text).not.toContain("hash-123");
    expect(text).toContain("Failed query: insert into user"); // the SQL stays
    expect(text).toContain("params: [omitted]");
  });
});

describe("serializeError", () => {
  it("drops an own `params` property, also inside a cause", () => {
    const withParams = (message: string) =>
      Object.assign(new Error(message), { params: ["ana@example.test"] });
    const out = serializeError(
      Object.assign(withParams("outer"), { cause: withParams("inner") }),
    );
    expect(JSON.stringify(out)).not.toContain("ana@example.test");
  });

  it("leaves an ordinary message alone", () => {
    expect(serializeError(new Error("plain")).message).toBe("plain");
  });
});
