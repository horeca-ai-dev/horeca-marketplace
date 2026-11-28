/**
 * API-key check of the mock supplier stock API: `Authorization: Bearer <SUPPLIER_API_KEY>`.
 *
 * Both sides are hashed first, so timingSafeEqual always compares 32 bytes: neither the content nor
 * the LENGTH of the expected key can be measured from the response time.
 */
import { createHash, timingSafeEqual } from "node:crypto";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export function isAuthorized(
  authorizationHeader: string | undefined,
  expectedKey: string,
): boolean {
  const match = /^Bearer (.+)$/.exec(authorizationHeader ?? "");
  // Compare even when the header is missing or malformed, so that case is not faster.
  const presented = match?.[1] ?? "";
  const equal = timingSafeEqual(sha256(presented), sha256(expectedKey));
  return match !== null && equal;
}
