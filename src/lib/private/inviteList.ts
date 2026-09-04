/**
 * The host's record of the invite links they have handed out (CORD-05 §4,
 * kind 13303).
 *
 * Without it, every open of the invite sheet minted a *fresh* single-use
 * keypair and published a new bundle, each one granting full access to the
 * party forever. A host who opened that sheet five times had scattered five
 * permanent keys they could not see, count or withdraw.
 *
 * Nothing here is new protocol. `buildRevocationEvent` and the `expires_at`
 * check in `parseBundleEvent` were already written and tested in the core; what
 * was missing was somewhere to keep the `signer_sk` that revocation needs, and
 * a caller. `mergeInviteLists` is a proper CRDT — the token is the merge key,
 * an entry is immutable once minted, and a tombstone beats an entry
 * terminally, so a stale device can never resurrect a revoked link.
 *
 * ## Two `expires_at` fields, two different units
 *
 * `InviteBundle.expires_at` is compared against `Date.now()`, so it is in
 * MILLISECONDS. `InviteListEntry.expires_at` is multiplied by 1000 by
 * `buildRefreshedBundleEvents`, so it is in SECONDS. Confusing them yields a
 * link that is either dead on arrival (1970) or effectively permanent (year
 * 56000), and both fail silently — the bundle just parses, or does not. The
 * conversions live in one place here, and a test pins both.
 */
import {
  EMPTY_INVITE_LIST,
  mergeInviteLists,
  type InviteList,
  type InviteListEntry,
} from "@/concord/lib/invite";

/** Bundle field naming the channel an entry belongs to. */
const CHANNEL_FIELD = "plektos_channel";

/** Default life of a link: the party, plus a month of stragglers. */
const DEFAULT_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export type { InviteList, InviteListEntry };
export { EMPTY_INVITE_LIST, mergeInviteLists };

/**
 * When a link minted now should stop working.
 *
 * Anchored to the party rather than to the moment of minting: a flat 30 days
 * would quietly kill the link for a party booked months out, which is exactly
 * when a host shares it. Returns milliseconds, for the bundle.
 */
export function defaultExpiry(eventEndsMs: number | undefined, nowMs: number): number {
  return Math.max(eventEndsMs ?? 0, nowMs) + DEFAULT_GRACE_MS;
}

/** Bundle milliseconds -> list seconds. */
export function toEntrySeconds(expiresAtMs: number): number {
  return Math.floor(expiresAtMs / 1000);
}

/** List seconds -> bundle milliseconds. */
export function toBundleMs(expiresAtSeconds: number): number {
  return expiresAtSeconds * 1000;
}

export function serializeInviteList(list: InviteList): string {
  return JSON.stringify(list);
}

/**
 * Parse a decrypted list, tolerating anything.
 *
 * This document round-trips through other clients, so a shape we do not
 * recognise is normal rather than exceptional. A malformed entry is dropped
 * instead of poisoning the whole list — losing one link's record is
 * recoverable, losing the document is not.
 */
export function parseInviteList(json: string): InviteList {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return EMPTY_INVITE_LIST;
  }
  if (!raw || typeof raw !== "object") return EMPTY_INVITE_LIST;
  const obj = raw as { entries?: unknown; tombstones?: unknown };
  const entries = Array.isArray(obj.entries)
    ? (obj.entries as InviteListEntry[]).filter(
        (e) =>
          e &&
          typeof e === "object" &&
          typeof e.token === "string" &&
          typeof e.signer_sk === "string" &&
          typeof e.community_id === "string" &&
          typeof e.url === "string",
      )
    : [];
  const tombstones = Array.isArray(obj.tombstones)
    ? (obj.tombstones as { token: string; community_id: string }[]).filter(
        (t) => t && typeof t === "object" && typeof t.token === "string",
      )
    : [];
  return { ...(raw as InviteList), entries, tombstones };
}

/** Which party an entry is for. */
export function channelOf(entry: InviteListEntry): string | undefined {
  const id = (entry as { [k: string]: unknown })[CHANNEL_FIELD];
  return typeof id === "string" ? id.toLowerCase() : undefined;
}

export interface NewInvite {
  token: string;
  signerSk: string;
  communityId: string;
  channelIdHex: string;
  url: string;
  /** Milliseconds, as the bundle carries it. Omit for a link that never expires. */
  expiresAtMs?: number;
  label?: string;
}

/** Record a freshly minted link. */
export function addInvite(list: InviteList, invite: NewInvite, nowMs: number): InviteList {
  const entry: InviteListEntry = {
    token: invite.token,
    signer_sk: invite.signerSk,
    community_id: invite.communityId,
    url: invite.url,
    created_at: Math.floor(nowMs / 1000),
    ...(invite.expiresAtMs ? { expires_at: toEntrySeconds(invite.expiresAtMs) } : {}),
    ...(invite.label ? { label: invite.label } : {}),
    [CHANNEL_FIELD]: invite.channelIdHex.toLowerCase(),
  };
  // Through the merge rather than by pushing: it is the function that knows an
  // entry is immutable per token and that a tombstone wins.
  return mergeInviteLists(list, { entries: [entry], tombstones: [] });
}

/**
 * Tombstone a link.
 *
 * Local bookkeeping only — the link stops working when the revocation event is
 * published at its coordinate, which is a separate network write. Recording it
 * here without that would hide a link from its own host while it kept working.
 */
export function revokeInvite(list: InviteList, token: string, communityId: string): InviteList {
  return mergeInviteLists(list, {
    entries: [],
    tombstones: [{ token, community_id: communityId }],
  });
}

/** Live, unexpired links for one party, newest first. */
export function liveInvitesFor(
  list: InviteList,
  channelIdHex: string,
  nowMs: number,
): InviteListEntry[] {
  const wanted = channelIdHex.toLowerCase();
  return list.entries
    .filter((e) => channelOf(e) === wanted)
    .filter((e) => e.expires_at === undefined || toBundleMs(e.expires_at) > nowMs)
    .sort((a, b) => b.created_at - a.created_at);
}
