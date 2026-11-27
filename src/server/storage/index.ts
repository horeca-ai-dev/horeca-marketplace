/**
 * Media storage on the S3 API (decision 013) — the ONLY place that touches media (CLAUDE.md layout).
 *
 *   import { storage } from "@/server/storage";
 *   await storage.put(productOriginalKey(id), buffer, { contentType: "image/png" });
 *   const object = await storage.get(key);          // { body, contentType, size } or null
 *
 * `put`, `get`, `head`, `delete`, `list` — and `ping` for /api/health. The library is `@aws-sdk/client-s3`
 * (exact version, no `^`); it talks to our own Garage, never to Amazon. Garage is internal: the browser never
 * sees it, uploads and downloads go through our route handlers.
 *
 * Rules for callers:
 *   - NEVER call it inside a database transaction (CLAUDE.md rule 11): it is an external call, like e-mail.
 *     Store the object first, then commit the row; jobs re-read state and are idempotent.
 *   - Keys come from `./keys` (built from our IDs); every key is validated again here.
 *   - `put` takes a Buffer, not a stream: images are ≤ 5 MB and PDFs are small. (A streaming upload would need
 *     `@aws-sdk/lib-storage`, a second dependency we do not need.)
 *   - A missing object is `null` (get / head), not an error. Everything else that goes wrong is a
 *     `StorageError`: not a DomainError, so an action answers INTERNAL and the user sees no details.
 *
 * The client is created on first use from `env` (like `getAuth()`), so importing this module — and
 * `next build` — needs no S3 variables. `createStorage(config)` exists for tests and tools that bring their own
 * settings.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { env } from "@/env.core";
import { getLogger } from "@/server/logger";
import { assertValidKey, assertValidPrefix } from "./keys";

export * from "./keys";

const log = getLogger("storage");

/** A hard stop against a programming error (a 400 MB buffer); the upload routes enforce the real limits. */
export const MAX_PUT_BYTES = 25 * 1024 * 1024;
const DEFAULT_LIST_LIMIT = 1_000;
const MAX_LIST_LIMIT = 10_000;
const PING_TIMEOUT_MS = 2_000;

export type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  /** Connection and whole-request timeouts; defaults 3 s and 30 s. */
  connectionTimeoutMs?: number;
  requestTimeoutMs?: number;
};

export type StoredObject = {
  key: string;
  size: number;
  contentType: string | undefined;
  lastModified: Date | undefined;
};

export type ObjectStream = {
  /** A Node stream; `Readable.toWeb(body)` turns it into a web stream for a Response. */
  body: Readable;
  contentType: string | undefined;
  size: number;
};

export type ListResult = {
  objects: { key: string; size: number; lastModified: Date | undefined }[];
  /** True when there are more objects than `limit` — never silently cut. */
  truncated: boolean;
};

/** Something went wrong talking to the storage (not "the object does not exist"). Safe to log, never to show. */
export class StorageError extends Error {
  readonly operation: string;
  constructor(operation: string, cause: unknown) {
    // No endpoint, bucket, key or credentials in the message: it may travel further than the log line.
    super(`Storage ${operation} failed.`, { cause });
    this.name = "StorageError";
    this.operation = operation;
  }
}

type SdkError = {
  name?: string;
  $metadata?: { httpStatusCode?: number };
};

/** 404 for an OBJECT. A missing bucket is also a 404 but is a configuration error and must not look like "no file". */
function isMissingObject(error: unknown): boolean {
  const e = error as SdkError | null;
  if (!e) return false;
  if (e.name === "NoSuchKey" || e.name === "NotFound") return true;
  return e.$metadata?.httpStatusCode === 404 && e.name !== "NoSuchBucket";
}

export function createStorage(config: StorageConfig) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
    maxAttempts: 3,
    requestHandler: {
      connectionTimeout: config.connectionTimeoutMs ?? 3_000,
      requestTimeout: config.requestTimeoutMs ?? 30_000,
    },
  });
  const Bucket = config.bucket;

  /** Runs one SDK call; every failure other than the ones the caller handles becomes a StorageError. */
  async function run<T>(
    operation: string,
    key: string | undefined,
    call: () => Promise<T>,
  ): Promise<T> {
    try {
      return await call();
    } catch (error) {
      const wrapped =
        error instanceof StorageError
          ? error
          : new StorageError(operation, error);
      log.error({ err: wrapped, operation, key }, "storage operation failed");
      throw wrapped;
    }
  }

  return {
    /** Stores (or overwrites) an object. */
    async put(
      key: string,
      body: Buffer | Uint8Array,
      options: { contentType: string },
    ): Promise<void> {
      assertValidKey(key);
      if (body.byteLength > MAX_PUT_BYTES) {
        throw new Error("Object too large for storage.put.");
      }
      await run("put", key, () =>
        client.send(
          new PutObjectCommand({
            Bucket,
            Key: key,
            Body: body,
            ContentType: options.contentType,
            ContentLength: body.byteLength,
          }),
        ),
      );
    },

    /** The object as a stream, or `null` when it does not exist. Consume or destroy the stream. */
    async get(key: string): Promise<ObjectStream | null> {
      assertValidKey(key);
      try {
        const res = await client.send(
          new GetObjectCommand({ Bucket, Key: key }),
        );
        return {
          body: res.Body as Readable,
          contentType: res.ContentType,
          size: res.ContentLength ?? 0,
        };
      } catch (error) {
        if (isMissingObject(error)) return null;
        return run("get", key, () => Promise.reject(error));
      }
    },

    /**
     * Size, type and date of an object without reading it, or `null` when it does not exist. A HEAD answer has no
     * body, so "no such object" and "no such bucket" look the same here (S3 itself works this way); a wrong bucket
     * shows up in `put`, `get` and `ping` instead.
     */
    async head(key: string): Promise<StoredObject | null> {
      assertValidKey(key);
      try {
        const res = await client.send(
          new HeadObjectCommand({ Bucket, Key: key }),
        );
        return {
          key,
          size: res.ContentLength ?? 0,
          contentType: res.ContentType,
          lastModified: res.LastModified,
        };
      } catch (error) {
        if (isMissingObject(error)) return null;
        return run("head", key, () => Promise.reject(error));
      }
    },

    /** Deletes an object. Deleting one that is not there is fine (idempotent), like S3 itself. */
    async delete(key: string): Promise<void> {
      assertValidKey(key);
      await run("delete", key, () =>
        client.send(new DeleteObjectCommand({ Bucket, Key: key })),
      );
    },

    /** Objects whose key starts with `prefix`, in key order, at most `limit` of them (default 1,000). */
    async list(
      prefix: string,
      options: { limit?: number } = {},
    ): Promise<ListResult> {
      assertValidPrefix(prefix);
      const limit = Math.min(
        Math.max(1, options.limit ?? DEFAULT_LIST_LIMIT),
        MAX_LIST_LIMIT,
      );
      const objects: ListResult["objects"] = [];
      let token: string | undefined;
      return run("list", prefix, async () => {
        for (;;) {
          const res = await client.send(
            new ListObjectsV2Command({
              Bucket,
              Prefix: prefix,
              ContinuationToken: token,
              // One more than we still need: seeing it proves there is more.
              MaxKeys: Math.min(1_000, limit - objects.length + 1),
            }),
          );
          for (const o of res.Contents ?? []) {
            if (o.Key === undefined) continue;
            if (objects.length === limit) return { objects, truncated: true };
            objects.push({
              key: o.Key,
              size: o.Size ?? 0,
              lastModified: o.LastModified,
            });
          }
          if (!res.IsTruncated || !res.NextContinuationToken) {
            return { objects, truncated: false };
          }
          token = res.NextContinuationToken;
        }
      });
    },

    /** Is the bucket reachable with our key? (HeadBucket, short timeout.) Throws StorageError when not. */
    async ping(): Promise<void> {
      await run("ping", undefined, () =>
        client.send(new HeadBucketCommand({ Bucket }), {
          abortSignal: AbortSignal.timeout(PING_TIMEOUT_MS),
        }),
      );
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;

let instance: Storage | undefined;

/** The application's storage, created on first use from the S3_* variables. */
export function getStorage(): Storage {
  instance ??= createStorage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
  return instance;
}

/** What the rest of the app imports: the same API, resolved lazily so nothing reads env at import time. */
export const storage: Storage = {
  put: (...args) => getStorage().put(...args),
  get: (...args) => getStorage().get(...args),
  head: (...args) => getStorage().head(...args),
  delete: (...args) => getStorage().delete(...args),
  list: (...args) => getStorage().list(...args),
  ping: () => getStorage().ping(),
};
