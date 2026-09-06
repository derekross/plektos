/**
 * The invite list, and the unit trap at its centre.
 *
 * `InviteBundle.expires_at` is milliseconds (compared against `Date.now()` in
 * `parseBundleEvent`); `InviteListEntry.expires_at` is seconds (multiplied by
 * 1000 in `buildRefreshedBundleEvents`). Getting either wrong produces a link
 * that is dead on arrival or effectively permanent, and neither failure is
 * visible — the bundle simply parses, or does not.
 */
import { describe, it, expect } from "vitest";

import { generateSecretKey, getPublicKey } from "nostr-tools";

import {
  buildBundleEvent,
  mintLinkSigner,
  mintToken,
  parseBundleEvent,
} from "@/concord/lib/invite";
import { bytesToHex, communityIdOf, hexToBytes, random32 } from "@/concord/lib/derive";
import {
  addInvite,
  defaultExpiry,
  liveInvitesFor,
  mergeInviteLists,
  parseInviteList,
  revokeInvite,
  serializeInviteList,
  toBundleMs,
  toEntrySeconds,
  EMPTY_INVITE_LIST,
} from "./inviteList";

const NOW = 1_800_000_000_000; // ms
const DAY = 86_400_000;

const invite = (token: string, channel = "aa", expiresAtMs?: number) => ({
  token,
  signerSk: "b".repeat(64),
  communityId: "c".repeat(64),
  channelIdHex: channel,
  url: `https://plektos.app/invite/naddr1${token}#frag`,
  ...(expiresAtMs ? { expiresAtMs } : {}),
});

describe("expires_at units", () => {
  it("stores seconds on the entry and hands back milliseconds", () => {
    const ms = NOW + 30 * DAY;
    const seconds = toEntrySeconds(ms);

    // A seconds value is ~1000x smaller. If these were ever confused, the
    // round trip would be off by three orders of magnitude.
    expect(seconds).toBeLessThan(ms / 500);
    expect(toBundleMs(seconds)).toBeCloseTo(ms, -3);
  });

  it("writes a seconds-scale expiry onto the entry", () => {
    const list = addInvite(EMPTY_INVITE_LIST, invite("t1", "aa", NOW + 30 * DAY), NOW);
    const entry = list.entries[0];

    // Seconds since the epoch are ten digits until the year 2286; milliseconds
    // are thirteen. This is the assertion that catches the swap.
    expect(String(entry.expires_at)).toHaveLength(10);
    expect(String(entry.created_at)).toHaveLength(10);
  });

  it("is accepted in ms and rejected in seconds by the real bundle parser", () => {
    // The consequence, proved against the actual core functions rather than
    // restated as our own arithmetic. Same bundle, same instant, one field in
    // the wrong unit.
    const { sk, pk } = mintLinkSigner();
    const token = mintToken();
    const owner = getPublicKey(generateSecretKey());
    const salt = random32();
    const bundle = {
      community_id: bytesToHex(communityIdOf(hexToBytes(owner), salt)),
      owner,
      owner_salt: bytesToHex(salt),
      community_root: bytesToHex(random32()),
      root_epoch: 0,
      channels: [],
      relays: ["wss://relay.example"],
      name: "Test party",
    };
    const expiresMs = NOW + 30 * DAY;

    const good = buildBundleEvent({ ...bundle, expires_at: expiresMs }, token, sk);
    expect(parseBundleEvent(good, pk, token, NOW).name).toBe("Test party");

    // Seconds on the bundle reads as a moment in 1970: born expired, silently.
    const bad = buildBundleEvent({ ...bundle, expires_at: toEntrySeconds(expiresMs) }, token, sk);
    expect(() => parseBundleEvent(bad, pk, token, NOW)).toThrow(/expired/);
  });
});

describe("defaultExpiry", () => {
  it("anchors to the end of the party, not the day the link was made", () => {
    const partyEnds = NOW + 200 * DAY;
    expect(defaultExpiry(partyEnds, NOW)).toBe(partyEnds + 30 * DAY);
  });

  it("falls back to a window from now for an undated party", () => {
    expect(defaultExpiry(undefined, NOW)).toBe(NOW + 30 * DAY);
  });

  it("never returns a past expiry for a party that already happened", () => {
    const over = NOW - 400 * DAY;
    expect(defaultExpiry(over, NOW)).toBeGreaterThan(NOW);
  });
});

describe("the list", () => {
  it("keeps links filed under their own party", () => {
    let list = addInvite(EMPTY_INVITE_LIST, invite("t1", "aa"), NOW);
    list = addInvite(list, invite("t2", "bb"), NOW);

    expect(liveInvitesFor(list, "aa", NOW)).toHaveLength(1);
    expect(liveInvitesFor(list, "bb", NOW)).toHaveLength(1);
    // Case is not a distinction anywhere else channel ids are handled.
    expect(liveInvitesFor(list, "AA", NOW)).toHaveLength(1);
  });

  it("hides an expired link without deleting the record", () => {
    const list = addInvite(EMPTY_INVITE_LIST, invite("t1", "aa", NOW - DAY), NOW);
    expect(liveInvitesFor(list, "aa", NOW)).toHaveLength(0);
    expect(list.entries).toHaveLength(1);
  });

  it("treats a link with no expiry as live", () => {
    const list = addInvite(EMPTY_INVITE_LIST, invite("t1"), NOW);
    expect(liveInvitesFor(list, "aa", NOW + 4_000 * DAY)).toHaveLength(1);
  });

  it("puts the newest link first, so the sheet shows the current one", () => {
    let list = addInvite(EMPTY_INVITE_LIST, invite("old"), NOW - 10 * DAY);
    list = addInvite(list, invite("new"), NOW);
    expect(liveInvitesFor(list, "aa", NOW)[0].token).toBe("new");
  });

  it("lets a tombstone beat an entry, terminally", () => {
    let list = addInvite(EMPTY_INVITE_LIST, invite("t1"), NOW);
    list = revokeInvite(list, "t1", "c".repeat(64));
    expect(liveInvitesFor(list, "aa", NOW)).toHaveLength(0);

    // A stale device re-offering the entry must not resurrect it: that would
    // silently turn a revoked link back on.
    const stale = { entries: [{ ...list.tombstones, token: "t1" }], tombstones: [] } as never;
    const merged = mergeInviteLists(list, stale);
    expect(merged.entries.some((e) => e.token === "t1")).toBe(false);
  });

  it("survives a round trip through the encrypted document", () => {
    let list = addInvite(EMPTY_INVITE_LIST, invite("t1", "aa", NOW + DAY), NOW);
    list = addInvite(list, invite("t2", "bb"), NOW);
    list = revokeInvite(list, "t2", "c".repeat(64));

    const back = parseInviteList(serializeInviteList(list));
    expect(back.entries).toHaveLength(1);
    expect(back.tombstones).toHaveLength(1);
    // The signer secret is the only thing that can ever revoke this link.
    // Losing it in serialization would make the link permanent.
    expect(back.entries[0].signer_sk).toBe("b".repeat(64));
    expect(liveInvitesFor(back, "aa", NOW)).toHaveLength(1);
  });

  it("drops a malformed entry rather than the whole document", () => {
    // This document round-trips through other clients, so an unrecognised
    // shape is normal. Losing one link's record is recoverable; losing the
    // list means every outstanding link becomes unrevocable.
    const raw = JSON.stringify({
      entries: [
        { token: "good", signer_sk: "b", community_id: "c", url: "u", created_at: 1 },
        { token: "bad" },
        null,
      ],
      tombstones: [{ token: "gone", community_id: "c" }],
    });
    const list = parseInviteList(raw);
    expect(list.entries.map((e) => e.token)).toEqual(["good"]);
    expect(list.tombstones).toHaveLength(1);
  });

  it("returns an empty list for unparseable content instead of throwing", () => {
    expect(parseInviteList("not json").entries).toHaveLength(0);
    expect(parseInviteList("null").entries).toHaveLength(0);
  });
});
