/**
 * Object keys in the media bucket (decision 013) — the one place that knows their shape.
 *
 *   products/<image id>/original          the uploaded file, as received
 *   products/<image id>/<320|640|1280>.webp   the three sizes the image job writes (`srcset`)
 *   invoices/<order id>.pdf               the pro-forma, rendered once
 *
 * Keys are built from IDs we generated (UUIDs), never from a file name or any text a user typed. Even so every
 * key that reaches the S3 client passes `assertValidKey`: S3 keys are not paths, but they end up in logs, in
 * URLs of the media route and in backup copies, so a key with `..`, a leading `/`, a space or an unusual
 * character is refused instead of trusted.
 */

/** The widths of the WebP sizes (decision 013; APPLIED.md · D3-B2). */
export const IMAGE_WIDTHS = [320, 640, 1280] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** One path segment: starts with a letter or digit, then letters, digits and . _ - (so never `.` or `..`). */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const MAX_KEY_LENGTH = 300;

/** Throws on anything that is not a plain `a/b/c.ext` key. Returns the key for chaining. */
export function assertValidKey(key: string): string {
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    key.length > MAX_KEY_LENGTH ||
    !key.split("/").every((segment) => SEGMENT.test(segment))
  ) {
    throw new Error("Invalid storage key.");
  }
  return key;
}

/**
 * A prefix for `list`: the same rules, but it may end with `/` (`products/`) — and it may not be empty, so a
 * bug cannot list the whole bucket.
 */
export function assertValidPrefix(prefix: string): string {
  assertValidKey(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix);
  return prefix;
}

function assertUuid(id: string): string {
  if (!UUID.test(id)) throw new Error("Invalid storage key.");
  return id.toLowerCase();
}

export const productOriginalKey = (imageId: string) =>
  `products/${assertUuid(imageId)}/original`;

export const productImageKey = (imageId: string, width: ImageWidth) => {
  if (!IMAGE_WIDTHS.includes(width)) throw new Error("Invalid storage key.");
  return `products/${assertUuid(imageId)}/${width}.webp`;
};

/** Everything stored for one image (the original and its sizes) — for deleting an image. */
export const productImagePrefix = (imageId: string) =>
  `products/${assertUuid(imageId)}/`;

export const invoiceKey = (orderId: string) =>
  `invoices/${assertUuid(orderId)}.pdf`;
