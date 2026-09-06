/**
 * The wrap walk, tested against the ways it can lose data silently.
 *
 * Every case here is one an adversarial review of the first design actually
 * broke. The first draft advanced its cursor with `Math.min` over the pooled
 * union, which is correct per relay and wrong across relays; two of these tests
 * fail outright against that version, and neither failure is visible to a user
 * — the party just renders with a hole in it.
 */
import { describe, it, expect } from "vitest";
import type { NostrEvent } from "@nostrify/nostrify";

import { fetchWraps } from "./stream";

const AUTHOR = "a".repeat(64);

function wrap(n: number, createdAt: number): NostrEvent {
  return {
    id: `${n}`.padStart(64, "0"),
    pubkey: AUTHOR,
    created_at: createdAt,
    kind: 1059,
    tags: [],
    content: "",
    sig: "",
  };
}

/**
 * A relay that honours NIP-01: newest-first, `limit` applied after `since` /
 * `until`, both bounds inclusive, ties broken by lowest id.
 */
function relay(events: NostrEvent[]) {
  const sorted = [...events].sort((a, b) =>
    b.created_at - a.created_at || a.id.localeCompare(b.id),
  );
  return (f: { limit: number; until?: number; since?: number }) =>
    sorted
      .filter((e) => (f.until === undefined || e.created_at <= f.until) &&
                     (f.since === undefined || e.created_at >= f.since))
      .slice(0, f.limit);
}

/** A pool over several relays: fan out, union, deduplicate — as NPool does. */
function pool(...relays: ReturnType<typeof relay>[]) {
  let calls = 0;
  const query = async (filters: Parameters<ReturnType<typeof relay>>[0][]) => {
    calls += 1;
    const seen = new Map<string, NostrEvent>();
    for (const r of relays) for (const e of r(filters[0])) seen.set(e.id, e);
    return [...seen.values()];
  };
  return { query: query as never, calls: () => calls };
}

const base = { kinds: [1059], authors: [AUTHOR] };
const opts = { relays: ["wss://x"], signal: new AbortController().signal };

describe("fetchWraps", () => {
  it("reassembles a stream far larger than one page, oldest wrap included", async () => {
    // One wrap a minute. The calendar rumor is #0 — the oldest, and the first
    // thing a single-shot `limit` query throws away.
    const all = Array.from({ length: 1_200 }, (_, i) => wrap(i, 1_000_000 + i * 60));
    const p = pool(relay(all));

    const got = await fetchWraps(p.query, base, { ...opts, page: 300 });

    expect(got.complete).toBe(true);
    expect(got.reason).toBe("end-of-history");
    expect(got.wraps).toHaveLength(1_200);
    expect(got.wraps.some((w) => w.id === wrap(0, 0).id)).toBe(true);
  });

  it("does not skip history a shallower relay still holds", async () => {
    // The review's case. Relay D has everything; relay J was down for the
    // middle. A cursor taken from the union's OLDEST event jumps straight past
    // the 2,400 wraps that only D holds, and reports success.
    const all = Array.from({ length: 3_000 }, (_, i) => wrap(i, 1_000_000 + i * 60));
    const gappy = [...all.slice(0, 300), ...all.slice(2_700)];
    const p = pool(relay(all), relay(gappy));

    const got = await fetchWraps(p.query, base, { ...opts, page: 300 });

    expect(got.complete).toBe(true);
    expect(got.wraps).toHaveLength(3_000);
  });

  it("survives a single backdated wrap that would poison a min-based cursor", async () => {
    // Any guest can derive the stream key and publish without a signer, so this
    // costs an attacker one event — but it only bites if that event reaches the
    // FIRST page, and `limit` returns the newest. The way to get it there is a
    // second relay holding little else: the pooled union then carries the whole
    // newest page from one relay plus the backdated wrap from the other, and a
    // `Math.min` cursor jumps to it on page one and truncates the party to its
    // newest page for every guest, on every device, permanently.
    const all = Array.from({ length: 900 }, (_, i) => wrap(i, 1_000_000 + i * 60));
    const poison = wrap(9_999, 1);
    const p = pool(relay([...all, poison]), relay([poison]));

    const got = await fetchWraps(p.query, base, { ...opts, page: 300 });

    expect(got.complete).toBe(true);
    expect(got.wraps).toHaveLength(901);
    // The calendar rumor is the oldest real wrap, and the whole point.
    expect(got.wraps.some((w) => w.id === wrap(0, 0).id)).toBe(true);
  });

  it("drains a second saturated beyond one page instead of stalling on it", async () => {
    // `until` is inclusive and NIP-01 has no secondary cursor, so a page that
    // sits entirely in one second makes a conforming relay return the same
    // tie-broken page forever. 700 wraps at t, page 300.
    const burst = Array.from({ length: 700 }, (_, i) => wrap(i, 5_000));
    const older = Array.from({ length: 100 }, (_, i) => wrap(1_000 + i, 4_000 - i));
    const p = pool(relay([...burst, ...older]));

    const got = await fetchWraps(p.query, base, { ...opts, page: 300 });

    expect(got.complete).toBe(true);
    expect(got.wraps).toHaveLength(800);
  });

  it("terminates when a relay caps its page below the requested limit", async () => {
    const all = Array.from({ length: 700 }, (_, i) => wrap(i, 1_000_000 + i * 60));
    const capped = (f: { limit: number; until?: number; since?: number }) =>
      relay(all)({ ...f, limit: Math.min(f.limit, 50) });
    const p = pool(capped);

    const got = await fetchWraps(p.query, base, { ...opts, page: 300 });

    expect(got.complete).toBe(true);
    expect(got.wraps).toHaveLength(700);
  });

  it("reports partial rather than complete when the budget runs out", async () => {
    const all = Array.from({ length: 5_000 }, (_, i) => wrap(i, 1_000_000 + i * 60));
    const p = pool(relay(all));

    const got = await fetchWraps(p.query, base, { ...opts, page: 300, maxPages: 3 });

    expect(got.complete).toBe(false);
    expect(got.reason).toBe("page-cap");
    expect(got.wraps.length).toBeLessThan(5_000);
  });

  it("reports partial when a flood saturates one second past the drain", async () => {
    const flood = Array.from({ length: 6_000 }, (_, i) => wrap(i, 5_000));
    const p = pool(relay([...flood, wrap(99_999, 10)]));

    const got = await fetchWraps(p.query, base, { ...opts, page: 300 });

    expect(got.complete).toBe(false);
    expect(got.reason).toBe("saturated-second");
  });

  it("stops immediately on an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const p = pool(relay([wrap(1, 5)]));

    const got = await fetchWraps(p.query, base, { ...opts, signal: controller.signal });

    expect(got.complete).toBe(false);
    expect(got.reason).toBe("budget");
    expect(p.calls()).toBe(0);
  });

  it("costs one request for a stream that fits in a page", async () => {
    // The common case must not regress into a multi-round-trip walk: a small
    // party is one query plus the empty page that proves it is the whole thing.
    const all = Array.from({ length: 20 }, (_, i) => wrap(i, 1_000 + i));
    const p = pool(relay(all));

    const got = await fetchWraps(p.query, base, { ...opts, page: 300 });

    expect(got.wraps).toHaveLength(20);
    expect(p.calls()).toBe(2);
  });
});
