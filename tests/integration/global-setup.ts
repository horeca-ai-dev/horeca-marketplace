/**
 * Vitest global setup for `pnpm test:integration` (D3-B1): a throw-away Postgres in Docker (Testcontainers).
 *
 *   1. start the SAME image as docker-compose.dev.yml, with the SAME init script that creates the three
 *      logins (horeca_owner / horeca_app / horeca_worker) — locally, in CI and on the server
 *   2. run the real migrate entry (src/migrate.ts) on the empty database: Drizzle migrations, the pg-boss
 *      schema and queues, grants — so every test run also proves the migrations work from zero
 *   3. point DATABASE_URL / DATABASE_WORKER_URL / DATABASE_MIGRATE_URL at it (test workers inherit
 *      process.env), so nothing touches the developer's own database
 *   4. on teardown the container is removed (Testcontainers' "ryuk" helper also removes it if this
 *      process is killed)
 *
 * Needs Docker running. Mailpit (used only by the e-mail test) still comes from docker-compose.dev.yml.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GenericContainer, Wait } from "testcontainers";

const root = resolve(import.meta.dirname, "../..");

/** The Postgres image is read from the compose file, so tests and local development can never drift apart. */
function postgresImage(): string {
  const compose = readFileSync(resolve(root, "docker-compose.dev.yml"), "utf8");
  const image = /^\s*image:\s*(postgres:\S+)\s*$/m.exec(compose)?.[1];
  if (!image)
    throw new Error("No postgres image found in docker-compose.dev.yml");
  return image;
}

const password = () => randomBytes(16).toString("hex");

export default async function setup(): Promise<() => Promise<void>> {
  const passwords = {
    superuser: password(),
    owner: password(),
    app: password(),
    worker: password(),
  };

  const container = await new GenericContainer(postgresImage())
    .withEnvironment({
      POSTGRES_PASSWORD: passwords.superuser,
      POSTGRES_OWNER_PASSWORD: passwords.owner,
      POSTGRES_APP_PASSWORD: passwords.app,
      POSTGRES_WORKER_PASSWORD: passwords.worker,
    })
    // Copied in (not bind-mounted): works the same with Docker Desktop on Windows. Must be executable,
    // otherwise the image's entrypoint would `source` it instead of running it.
    .withCopyFilesToContainer([
      {
        source: resolve(root, "deploy/postgres/init/01-roles.sh"),
        target: "/docker-entrypoint-initdb.d/01-roles.sh",
        mode: 0o755,
      },
    ])
    .withExposedPorts(5432)
    // "ready to accept connections" appears twice: for the temporary init server, then for the real one.
    .withWaitStrategy(
      Wait.forLogMessage(/database system is ready to accept connections/, 2),
    )
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const url = (user: string, pass: string) =>
    `postgresql://${user}:${pass}@${host}:${port}/horeca`;

  Object.assign(process.env, {
    DATABASE_URL: url("horeca_app", passwords.app),
    DATABASE_WORKER_URL: url("horeca_worker", passwords.worker),
    DATABASE_MIGRATE_URL: url("horeca_owner", passwords.owner),
  });

  try {
    // The real entry point, in its own process, exactly as CI and the migrate container run it.
    execFileSync(process.execPath, ["--import", "tsx", "src/migrate.ts"], {
      cwd: root,
      env: process.env,
      stdio: "pipe",
    });
  } catch (error) {
    await container.stop();
    const out = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `Migrate entry failed on the Testcontainers database:\n${out.stdout?.toString() ?? ""}${out.stderr?.toString() ?? ""}`,
    );
  }

  return async () => {
    await container.stop();
  };
}
