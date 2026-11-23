import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Authenticated encryption for small JSON payloads (the M1 session cookie).
 *
 * AES-256-GCM: the player can neither read the payload (encrypted) nor edit it
 * (any change fails the auth tag and we return null). The key is derived from the
 * secret with HKDF and bound to a `purpose`, so a token sealed for one cookie
 * can't be replayed as another. Built on node:crypto: no extra dependency.
 *
 * Token format (base64url): version(1) | iv(12) | tag(16) | ciphertext
 */

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function deriveKey(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "secret-side", `${purpose}:v${VERSION}`, 32));
}

export function sealJson(value: unknown, secret: string, purpose: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, purpose), iv);
  cipher.setAAD(Buffer.from(purpose));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64url",
  );
}

/** Returns null for anything tampered, truncated, from another key/purpose, or not JSON. */
export function unsealJson(token: string, secret: string, purpose: string): unknown {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length <= 1 + IV_BYTES + TAG_BYTES || raw[0] !== VERSION) return null;
    const iv = raw.subarray(1, 1 + IV_BYTES);
    const tag = raw.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const ciphertext = raw.subarray(1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret, purpose), iv);
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    return null;
  }
}
