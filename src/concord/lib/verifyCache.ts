/**
 * Event verification that pays the Schnorr check ONCE per event id.
 *
 * Every non-wrap event a relay serves is Schnorr-verified synchronously in the
 * WebSocket message handler (~1–2ms each on a phone), and nothing deduped that
 * across relays or query rounds: a measured boot that stored ~2k unique events
 * received ~6k copies, so roughly two thirds of the main-thread crypto was
 * re-proving content already proven authentic. This memo makes verification
 * O(unique events) instead of O(copies received).
 *
 * The memo is sound because an event id IS the sha256 of the event's content:
 *
 *  - The claimed id is ALWAYS recomputed from the copy in hand first. The memo
 *    maps an id to "content hashing to this was verified", and the recomputed
 *    hash is the only thing binding THIS copy to that claim — without it, any
 *    content could ride a known-good id.
 *  - Only then may the Schnorr verify be skipped: an identical hash means
 *    identical content, and a valid signature over that content has already
 *    been seen. A duplicate copy carrying a MANGLED sig is thereby accepted —
 *    deliberately: the content is authentic regardless, and the stores strip
 *    `sig` before persisting (see mainEventStore), so the bad copy's sig
 *    outlives nothing.
 *  - A FAILED verify is never memoized, so a forged copy cannot poison the id
 *    for the honest copy that arrives later.
 *
 * The hash is recomputed per copy on purpose: sha256 of a ~1KB event is
 * microseconds against the Schnorr verify's milliseconds, and it is the whole
 * of the memo's security argument.
 */
import { schnorr } from "@noble/curves/secp256k1.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { getEventHash } from "nostr-tools/pure";

import { perfCount } from "./ports";

import type { NostrEvent } from "./rumor";

/** Bounded FIFO — sized for a session's traffic, not a database's contents. */
const MAX_IDS = 20_000;
const verified = new Set<string>();

/** Verify `event`, skipping the Schnorr check for an id already verified. */
export function verifyEventOnce(event: NostrEvent): boolean {
  const start = performance.now();

  let hash: string;
  try {
    // `getEventHash` serializes, and serializing an event with missing or
    // ill-typed fields THROWS rather than returning a non-matching hash. A
    // malformed event has to read as unverified, not as an exception: callers
    // include `openWrap`, whose seal is JSON parsed out of a decrypted payload
    // and shaped by whoever holds the group key. (nostr-tools' own
    // `verifyEvent` catches this internally; so must the memoized form.)
    hash = getEventHash(event);
  } catch {
    perfCount("crypto.verifyEvent", performance.now() - start, 1, "events");
    return false;
  }

  if (hash !== event.id) {
    perfCount("crypto.verifyEvent", performance.now() - start, 1, "events");
    return false;
  }

  if (verified.has(event.id)) {
    perfCount("crypto.verifyEvent (memo hit)", performance.now() - start, 1, "events");
    return true;
  }

  let ok = false;
  try {
    // Inside the try: malformed hex in any field throws, and reads as invalid.
    ok = schnorr.verify(hexToBytes(event.sig), hexToBytes(event.id), hexToBytes(event.pubkey));
  } catch {
    ok = false;
  }
  if (ok) {
    if (verified.size >= MAX_IDS) {
      // Oldest insertion first — `Set` iterates in insertion order.
      const oldest = verified.keys().next();
      if (!oldest.done) verified.delete(oldest.value);
    }
    verified.add(event.id);
  }
  perfCount("crypto.verifyEvent", performance.now() - start, 1, "events");
  return ok;
}

/** Test seam: forget every verified id. */
export function _resetVerifyCacheForTests(): void {
  verified.clear();
}
