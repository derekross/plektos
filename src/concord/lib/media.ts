/**
 * The two encrypted-media primitives `image.ts` needs, carved from Armada's
 * `src/lib/encryptedMedia.ts` (which is otherwise a media-viewer cache this app
 * has no use for).
 *
 * Not wire format — this is transport and framing only, so a compact
 * implementation is fine here where a faithful copy is required elsewhere.
 */
import { hexToBytes } from "@noble/hashes/utils.js";

/** Refuse anything implausible for a cover image before allocating for it. */
export const MAX_DECRYPT_BYTES = 64 * 1024 * 1024;

export class FileTooLargeError extends Error {
  constructor(public readonly bytes: number) {
    super(`file is ${bytes} bytes, over the limit`);
    this.name = "FileTooLargeError";
  }
}

/** `Uint8Array` whose buffer is a plain ArrayBuffer, as WebCrypto expects. */
function buf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
}

/**
 * Fetch with a hard byte ceiling.
 *
 * The declared Content-Length is checked FIRST so an oversized response is
 * refused before a byte of it is buffered; the decoded length is then checked
 * again, because the header is a claim from a server we do not control.
 */
export async function fetchCapped(
  url: string,
  opts: { signal?: AbortSignal; maxBytes?: number } = {},
): Promise<ArrayBuffer> {
  const maxBytes = opts.maxBytes ?? MAX_DECRYPT_BYTES;
  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) throw new Error(`attachment fetch failed: HTTP ${res.status}`);

  const header = res.headers.get("content-length");
  const declared = header === null ? NaN : Number(header);
  if (Number.isFinite(declared) && declared > maxBytes) throw new FileTooLargeError(declared);

  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new FileTooLargeError(buffer.byteLength);
  return buffer;
}

/** AES-256-GCM decrypt. Throws if the tag does not verify. */
export async function decryptBuffer(
  ciphertext: BufferSource,
  keyHex: string,
  nonceHex: string,
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    buf(hexToBytes(keyHex)),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: buf(hexToBytes(nonceHex)) },
    cryptoKey,
    ciphertext,
  );
}
