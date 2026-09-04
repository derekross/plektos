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
export function streamFilter(streams: readonly { stream: StreamKeyView }[], limit = PAGE) {
  return {
    kinds: [KIND_WRAP],
    authors: streams.map((s) => s.stream.pk),
    limit,
  };
}

/** Wraps per request. Comfortably under the common relay cap of 500. */
export const PAGE = 300;
/** One saturated second is drained in a single request of this size. */
const DRAIN = 5_000;
/** Resource backstops. The walk terminates on its own; these bound the cost. */
const MAX_PAGES = 24;
const MAX_WRAPS = 6_000;

type Filter = { kinds: number[]; authors: string[]; limit: number; until?: number; since?: number };
type Query = (filters: Filter[], opts: { signal: AbortSignal; relays: string[] }) => Promise<NostrEvent[]>;

export interface WrapPage {
  wraps: NostrEvent[];
  /**
   * True ONLY when the walk provably reached the end of history — an empty
   * page at the current cursor. Everything else is partial, and the caller
   * must say so rather than rendering a hole as a complete party.
   */
  complete: boolean;
  reason?: "end-of-history" | "budget" | "page-cap" | "saturated-second";
}

/**
 * Read a stream's whole history, walking backwards with `until`.
 *
 * Needed because the rumor kind is inside the ciphertext: a relay sees only
 * kind 1059 and an author, so there is no server-side way to ask for "just the
 * calendar event". NIP-01 `limit` returns the NEWEST n, and the calendar rumor
 * is the OLDEST wrap in the stream — so a single-shot query does not lose old
 * chat when a party gets busy, it loses the party's own definition.
 *
 * Three things here are less obvious than they look.
 *
 * **The cursor is the PAGE-th newest, not the oldest.** `NPool.query` sends the
 * same `limit` to every relay and returns the union, so the oldest event in the
 * union is the deepest relay's floor. Advancing to it skips everything the
 * shallowest relay had not reached yet — silently, and only when relays hold
 * different subsets, which `NPool.event`'s publish-to-the-first-that-answers
 * guarantees they will. `batch[PAGE-1]` is sound: some relay returned a full
 * page down to its own floor F, so the union holds at least PAGE events at or
 * above F, so the PAGE-th newest is at or above F, and the union is complete
 * over everything above it. It over-fetches; it never skips.
 *
 * **A saturated second cannot be paged with `until` alone.** `until` is
 * inclusive and there is no secondary cursor in NIP-01, so if a whole page
 * shares one timestamp the cursor stops moving and a conforming relay returns
 * the same tie-broken page forever. That second is drained explicitly with
 * `{since: t, until: t}` before stepping below it. It needs no attacker: one
 * client action publishes an event plus several sign-up items in the same
 * second, and `wrapSeal` does not fuzz timestamps the way NIP-59 does.
 *
 * **Completeness is reported, not assumed.** Every guest can derive the stream
 * key and publish to it without a signer, so history is attacker-extensible;
 * the budget exists to bound that, and hitting it must read as "partial", never
 * as "that is all there is".
 */
export async function fetchWraps(
  query: Query,
  base: { kinds: number[]; authors: string[] },
  opts: {
    relays: string[];
    signal: AbortSignal;
    page?: number;
    maxPages?: number;
    maxWraps?: number;
  },
): Promise<WrapPage> {
  const page = opts.page ?? PAGE;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const maxWraps = opts.maxWraps ?? MAX_WRAPS;
  const seen = new Map<string, NostrEvent>();
  const done = (complete: boolean, reason?: WrapPage["reason"]): WrapPage => ({
    wraps: [...seen.values()],
    complete,
    reason,
  });
  const absorb = (batch: readonly NostrEvent[]) => {
    for (const w of batch) if (!seen.has(w.id)) seen.set(w.id, w);
  };

  let until: number | undefined;
  for (let n = 0; n < maxPages; n += 1) {
    if (opts.signal.aborted) return done(false, "budget");

    const batch = await query([{ ...base, limit: page, ...(until !== undefined && { until }) }], {
      signal: opts.signal,
      relays: opts.relays,
    });
    if (batch.length === 0) return done(true, "end-of-history");
    absorb(batch);
    if (seen.size > maxWraps) return done(false, "budget");

    // `NPool.query` returns newest-first (NSet sorts on iteration), but a
    // caller may pass a plainer querier, so do not depend on it.
    const times = batch.map((w) => w.created_at).sort((a, b) => b - a);
    const full = batch.length >= page;
    const cursor = times[Math.min(page, times.length) - 1];

    // A page that did not fill means no relay had more to give at this cursor,
    // so everything at `cursor` is already in hand and we can step strictly
    // below it. Doing otherwise costs every small party a pointless extra round
    // trip, because the cursor lands exactly on its own oldest event.
    //
    // The exception is a short page whose events all share one timestamp: that
    // is what a relay capping below our `limit` looks like in the middle of a
    // saturated second, and stepping below it would skip the rest of them.
    const saturated = full ? cursor === until : times[0] === times[times.length - 1] && batch.length > 1;

    if (saturated) {
      // `until` is inclusive and NIP-01 has no secondary cursor, so this second
      // has to be taken in one bite before we can step past it.
      const drain = await query([{ ...base, since: cursor, until: cursor, limit: DRAIN }], {
        signal: opts.signal,
        relays: opts.relays,
      });
      absorb(drain);
      if (drain.length >= DRAIN) return done(false, "saturated-second");
      until = cursor - 1;
    } else if (full) {
      // Inclusive boundary; the id-keyed map absorbs the one-event overlap.
      until = cursor;
    } else {
      until = cursor - 1;
    }
  }
  return done(false, "page-cap");
}
