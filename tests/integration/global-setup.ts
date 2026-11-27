/**
 * Vitest global setup for `pnpm test:integration` (D3-B1; Garage added in D5-B3b): throw-away Postgres and
 * Garage in Docker (Testcontainers).
 *
 *   1. start the SAME Postgres image as docker-compose.dev.yml, with the SAME init script that creates the
 *      three logins (horeca_owner / horeca_app / horeca_worker) — locally, in CI and on the server
 *   2. run the real migrate entry (src/migrate.ts) on the empty database: Drizzle migrations, the pg-boss
 *      schema and queues, grants — so every test run also proves the migrations work from zero
 *   3. start the SAME Garage image (S3-compatible media storage, decision 013) with the SAME
 *      deploy/garage/garage.toml, and do what scripts/garage-setup.sh does: layout, bucket, app key with
 *      read/write on that bucket. (The script itself uses `docker compose exec`, so the steps are repeated
 *      here through `container.exec`.)
 *   4. point DATABASE_URL / DATABASE_WORKER_URL / DATABASE_MIGRATE_URL and the S3_* variables at them (test
 *      workers inherit process.env), so nothing touches the developer's own database or bucket
 *   5. on teardown the containers are removed (Testcontainers' "ryuk" helper also removes them if this
 *      process is killed)
 *
 * Needs Docker running. Mailpit (used only by the e-mail test) still comes from docker-compose.dev.yml.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";

const root = resolve(import.meta.dirname, "../..");
const compose = () =>
  readFileSync(resolve(root, "docker-compose.dev.yml"), "utf8");
const garageToml = () =>
  readFileSync(resolve(root, "deploy/garage/garage.toml"), "utf8");

/** The Postgres image is read from the compose file, so tests and local development can never drift apart. */
function postgresImage(): string {
  const image = /^\s*image:\s*(postgres:\S+)\s*$/m.exec(compose())?.[1];
  if (!image)
    throw new Error("No postgres image found in docker-compose.dev.yml");
  return image;
}

/** Same for Garage. */
function garageImage(): string {
  const image = /^\s*image:\s*(dxflrs\/garage:\S+)\s*$/m.exec(compose())?.[1];
  if (!image)
    throw new Error("No garage image found in docker-compose.dev.yml");
  return image;
}

const password = () => randomBytes(16).toString("hex");

type Postgres = {
  container: StartedTestContainer;
  urls: Record<string, string>;
};

async function startPostgres(): Promise<Postgres> {
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

  return {
    container,
    urls: {
      DATABASE_URL: url("horeca_app", passwords.app),
      DATABASE_WORKER_URL: url("horeca_worker", passwords.worker),
      DATABASE_MIGRATE_URL: url("horeca_owner", passwords.owner),
    },
  };
}

/** Runs the Garage CLI inside the container (the image has no shell, so no `sh -c`); fails on a non-zero exit. */
async function garageCli(
  container: StartedTestContainer,
  ...args: string[]
): Promise<string> {
  const { exitCode, output } = await container.exec(["/garage", ...args]);
  if (exitCode !== 0) {
    throw new Error(
      `garage ${args.join(" ")} failed (${exitCode}):\n${output}`,
    );
  }
  return output;
}

const BUCKET = "horeca-test";

/** Garage with the layout applied, one bucket and one key that may read and write only that bucket. */
async function startGarage(): Promise<{
  container: StartedTestContainer;
  env: Record<string, string>;
}> {
  const container = await new GenericContainer(garageImage())
    .withEnvironment({
      // Garage insists on 64 hex characters for the RPC secret.
      GARAGE_RPC_SECRET: randomBytes(32).toString("hex"),
      GARAGE_ADMIN_TOKEN: password(),
    })
    .withCopyFilesToContainer([
      {
        source: resolve(root, "deploy/garage/garage.toml"),
        target: "/etc/garage.toml",
      },
    ])
    .withExposedPorts(3900)
    .withWaitStrategy(Wait.forLogMessage(/S3 API server listening/))
    .start();

  try {
    // 1. Layout: one zone, one node (the same steps as scripts/garage-setup.sh).
    const nodeId = (await garageCli(container, "node", "id", "-q"))
      .trim()
      .split("@")[0]!;
    await garageCli(
      container,
      "layout",
      "assign",
      "-z",
      "dc1",
      "-c",
      "1G",
      nodeId,
    );
    await garageCli(container, "layout", "apply", "--version", "1");
    // Bucket and key operations need a healthy cluster, which it becomes right after the layout.
    for (let i = 0; ; i += 1) {
      try {
        await garageCli(container, "health");
        break;
      } catch (error) {
        if (i >= 30) throw error;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    // 2.–4. Bucket, key, permissions.
    await garageCli(container, "bucket", "create", BUCKET);
    const key = await garageCli(container, "key", "create", "horeca-test-app");
    const keyId = /^Key ID:\s*(\S+)/m.exec(key)?.[1];
    const secret = /^Secret key:\s*(\S+)/m.exec(key)?.[1];
    if (!keyId || !secret) {
      throw new Error(
        "Could not read the key ID / secret from `garage key create`",
      );
    }
    await garageCli(
      container,
      "bucket",
      "allow",
      "--read",
      "--write",
      BUCKET,
      "--key",
      "horeca-test-app",
    );

    const region = /^\s*s3_region\s*=\s*"([^"]+)"/m.exec(garageToml())?.[1];
    if (!region) throw new Error("No s3_region in deploy/garage/garage.toml");
    return {
      container,
      env: {
        S3_ENDPOINT: `http://${container.getHost()}:${container.getMappedPort(3900)}`,
        S3_REGION: region,
        S3_BUCKET: BUCKET,
        S3_ACCESS_KEY_ID: keyId,
        S3_SECRET_ACCESS_KEY: secret,
        S3_FORCE_PATH_STYLE: "true",
      },
    };
  } catch (error) {
    await container.stop();
    throw error;
  }
}

export default async function setup(): Promise<() => Promise<void>> {
  // Both containers start at the same time; Garage's setup runs while Postgres boots.
  const [pg, ga] = await Promise.allSettled([startPostgres(), startGarage()]);
  if (pg.status === "rejected" || ga.status === "rejected") {
    // One of the two failed: do not leave the other one running.
    if (pg.status === "fulfilled") await pg.value.container.stop();
    if (ga.status === "fulfilled") await ga.value.container.stop();
    throw pg.status === "rejected"
      ? pg.reason
      : (ga as PromiseRejectedResult).reason;
  }
  const postgres = pg.value;
  const garage = ga.value;

  Object.assign(process.env, postgres.urls, garage.env);

  const stopAll = async () => {
    await Promise.all([postgres.container.stop(), garage.container.stop()]);
  };

  try {
    // The real entry point, in its own process, exactly as CI and the migrate container run it.
    execFileSync(process.execPath, ["--import", "tsx", "src/migrate.ts"], {
      cwd: root,
      env: process.env,
      stdio: "pipe",
    });
  } catch (error) {
    await stopAll();
    const out = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `Migrate entry failed on the Testcontainers database:\n${out.stdout?.toString() ?? ""}${out.stderr?.toString() ?? ""}`,
    );
  }

  return stopAll;
}
