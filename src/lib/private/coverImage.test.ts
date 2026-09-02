/**
 * The encrypted cover.
 *
 * The property that matters: what reaches the image host is ciphertext, and
 * only a holder of the key from inside the encrypted event can recover the
 * original bytes. A silent failure here would look exactly like success —
 * an image that renders locally while the plaintext sits publicly on Blossom.
 */
import { describe, expect, it } from "vitest";

import { encryptImageBlob } from "@/concord/lib/image";
import { decryptBuffer } from "@/concord/lib/media";
import { isImagePointer } from "@/concord/lib/types";
import { buildCalendarTags } from "@/lib/private/calendar";

/**
 * jsdom's Blob has no `arrayBuffer()`, which the real browser Blob does.
 * `encryptImageBlob` only ever calls that one method, so a stand-in exercises
 * the identical code path without dragging the suite out of jsdom.
 */
function blobOf(bytes: Uint8Array): Blob {
  return { arrayBuffer: async () => bytes.buffer.slice(0) } as unknown as Blob;
}

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG magic
  ...Array.from({ length: 512 }, (_, i) => i % 251),
]);

describe("encrypted cover image", () => {
  it("uploads ciphertext, not the image", async () => {
    const { ciphertext, key, nonce } = await encryptImageBlob(blobOf(PNG));

    // The bytes that would be uploaded must not be the image.
    expect(ciphertext.length).not.toBe(PNG.length);
    const head = Array.from(ciphertext.slice(0, 8));
    expect(head, "PNG magic must not survive into the ciphertext").not.toEqual(
      Array.from(PNG.slice(0, 8)),
    );
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(nonce).toMatch(/^[0-9a-f]+$/);
  });

  it("round-trips back to the exact original bytes", async () => {
    const { ciphertext, key, nonce } = await encryptImageBlob(blobOf(PNG));
    const plain = new Uint8Array(await decryptBuffer(ciphertext, key, nonce));
    expect(Array.from(plain)).toEqual(Array.from(PNG));
  });

  it("refuses to decrypt with the wrong key", async () => {
    const { ciphertext, nonce } = await encryptImageBlob(blobOf(PNG));
    const wrong = "ab".repeat(32);
    await expect(decryptBuffer(ciphertext, wrong, nonce)).rejects.toBeTruthy();
  });

  it("carries the pointer in image_enc, never in image", async () => {
    const { key, nonce, hash } = await encryptImageBlob(blobOf(PNG));
    const pointer = { url: "https://blossom.example/abc", key, nonce, hash };
    expect(isImagePointer(pointer)).toBe(true);

    const tags = buildCalendarTags({
      identifier: "d1",
      kind: 31923,
      title: "Party",
      start: "1800000000",
      imageEnc: pointer,
    });

    // `image` stays absent: other NIP-52 clients expect a plain URL there and
    // would render a broken cover if handed a pointer.
    expect(tags.find((t) => t[0] === "image")).toBeUndefined();
    const enc = tags.find((t) => t[0] === "image_enc");
    expect(enc).toBeTruthy();
    expect(JSON.parse(enc![1])).toEqual(pointer);
  });
});
