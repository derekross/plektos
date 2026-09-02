/**
 * Reading a private event's encrypted stream.
 *
 * Plektos has a complete NIP-17 *send* path (`useDirectMessage`) and, before
 * this, no receive path at all — nothing ever queried kind 1059 and there was
 * no unwrap helper. This is that half.
 *
 * The actual cryptography lives in `@/concord/lib/stream`; `openWrap` does the
 * wrap decrypt, the seal's Schnorr verify, the rumor-id recompute, and the
 * `rumor.pubkey === seal.pubkey` check that stops a keyholder re-sealing
 * someone else's rumor under their own name. This module is the caching and
 * fetching around it, plus one thing the sibling app got wrong.
 */
import type { NostrEvent } from "@nostrify/nostrify";

import { KIND_WRAP } from "@/concord/lib/kinds";
import type { StreamKeyView } from "@/concord/lib/derive";
import { checkChannelBinding, openWrap, type OpenedEvent } from "@/concord/lib/stream";

/**
 * Decode-once memo, keyed by wrap id.
 *
 * A wrap's decryption and seal verification are immutable, and the polling
 * hooks re-read the same history on every refetch. `null` memoizes a FAILURE
 * (not ours, malformed, wrong channel) so a wrap that can never open is not
 * retried on every poll either.
 *
 * Deliberately in-memory and never persisted. Decrypted private content must
 * not reach IndexedDB: for a bunker signer the whole security property is that
 * the device holds no key material, and writing decrypted rosters and chat to
 * Dexie would quietly destroy it.
 */
const openedWrapCache = new Map<string, OpenedEvent | null>();
const MAX_CACHED_WRAPS = 3000;

function remember(wrapId: string, opened: OpenedEvent | null): OpenedEvent | null {
  if (openedWrapCache.size >= MAX_CACHED_WRAPS) {
    // Cheap FIFO: drop the oldest insertion. Map preserves insertion order.
    const oldest = openedWrapCache.keys().next().value;
    if (oldest !== undefined) openedWrapCache.delete(oldest);
  }
  openedWrapCache.set(wrapId, opened);
  return opened;
}

/** Forget every memoized wrap (sign-out, or a key set changing under us). */
export function clearOpenedWrapCache(): void {
  openedWrapCache.clear();
}

/**
 * Open every wrap that decodes under one of `streams`, enforcing the channel
 * binding.
 *
 * The binding check is the part worth spelling out. Every chat-plane rumor
 * commits `["channel", id]` + `["epoch", n]` (CORD-03 §3) so a wrap cannot be
 * spliced out of one channel and replayed into another. The sibling app adds
 * those tags on every write but **never calls `checkChannelBinding` on read** —
 * the anti-splice guarantee was inert there. Enforced here.
 */
export function openEventWraps(
  wraps: readonly NostrEvent[],
  streams: readonly { stream: StreamKeyView; channelIdHex: string; epoch: bigint }[],
): OpenedEvent[] {
  const out: OpenedEvent[] = [];
  for (const wrap of wraps) {
    const cached = openedWrapCache.get(wrap.id);
    if (cached !== undefined) {
      if (cached) out.push(cached);
      continue;
    }

    let opened: OpenedEvent | null = null;
    for (const { stream, channelIdHex, epoch } of streams) {
      if (wrap.pubkey !== stream.pk) continue;
      try {
        const candidate = openWrap(wrap, stream);
        checkChannelBinding(candidate, channelIdHex, epoch);
        opened = candidate;
        break;
      } catch {
        // Wrong epoch key, malformed, or spliced from another channel. Try the
        // next stream; if none open it, the null below memoizes the failure.
        opened = null;
      }
    }

    // An epoch we do not hold is left UNCACHED: a later rekey may deliver the
    // key, and a memoized null would make that wrap permanently invisible.
    if (opened === null && !streams.some((s) => s.stream.pk === wrap.pubkey)) continue;

    if (remember(wrap.id, opened)) out.push(opened as OpenedEvent);
  }
  return out;
}

/** The filter that reads a private event's stream across every held epoch. */
export function streamFilter(streams: readonly { stream: StreamKeyView }[], limit = 500) {
  return {
    kinds: [KIND_WRAP],
    authors: streams.map((s) => s.stream.pk),
    limit,
  };
}
