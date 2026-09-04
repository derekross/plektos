/**
 * Invite links for private events (CORD-05).
 *
 * The link is a public locator plus a secret:
 *
 *   https://<host>/invite/<naddr for (33301, link_signer, d="")>#<fragment>
 *
 * The fragment carries the unlock token and never reaches a server — not in a
 * request path, not in a Referer, not in server logs. That is the whole reason
 * the secret lives after the `#`, and it is why the UI has to say "send the
 * whole link" where someone might otherwise copy only the visible part.
 *
 * Each link is signed by a FRESH single-use keypair, so a link-holder can join
 * but can never squat the coordinate or revoke someone else's link.
 */
import {
  buildBundleEvent,
  buildInviteUrl,
  mintLinkSigner,
  mintToken,
  type InviteBundle,
} from "@/concord/lib/invite";
import { bytesToHex } from "@/concord/lib/derive";
import type { Community } from "@/concord/lib/types";
import type { JoinMaterial } from "@/concord/lib/communityList";
import { withAnchor } from "./create";

/** Bundle field carrying the shared channel's calendar wrap id. */
export const PLEKTOS_ANCHOR_FIELD = "plektos_anchor";

/** Build the 33301 bundle event plus the shareable URL for a private event. */
export function mintInvite(
  community: Community,
  channelIdHex: string,
  origin: string,
  opts: { description?: string; expiresAt?: number; anchor?: string } = {},
) {
  const channel = community.privateChannels.find((c) => bytesToHex(c.id) === channelIdHex);
  if (!channel) throw new Error("That party's channel key isn't in this community.");
  const { sk, pk } = mintLinkSigner();
  const token = mintToken();

  const bundle: InviteBundle = {
    community_id: community.idHex,
    owner: community.owner,
    owner_salt: bytesToHex(community.ownerSalt),
    community_root: bytesToHex(community.root),
    root_epoch: Number(community.rootEpoch),
    // Read access to the Control Plane. Absent would mean a legacy pre-split
    // community; omitting it for a community that HAS one makes every joiner
    // fold at the wrong address and see no channels at all.
    control_pk: community.controlPk,
    // EXACTLY the one party being shared. The host's community may hold many
    // private channels; delivering more than this one would hand a guest of
    // this party the keys to every other party too.
    channels: [
      {
        id: bytesToHex(channel.id),
        key: bytesToHex(channel.key),
        epoch: Number(channel.epoch),
        name: channel.name,
      },
    ],
    relays: [...community.relays],
    name: channel.name,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.expiresAt ? { expires_at: opts.expiresAt } : {}),
    // The calendar wrap id for THIS channel, so a guest can open the party in
    // one lookup instead of walking its whole history. Singular because a
    // bundle carries exactly one channel; `bundleToJoinMaterial` files it into
    // the per-channel anchor map on the way into the key list.
    ...(opts.anchor ? { [PLEKTOS_ANCHOR_FIELD]: opts.anchor } : {}),
  };

  return {
    event: buildBundleEvent(bundle, token, sk),
    url: buildInviteUrl(origin, pk, token, community.relays),
    linkSigner: pk,
    // Both are needed to record the link in the Invite List: the token is its
    // merge key there, and the signer secret is the ONLY thing that can later
    // author a revocation at this coordinate. Discarding them, as this did
    // before, is what made every minted link permanent.
    token: bytesToHex(token),
    signerSk: bytesToHex(sk),
  };
}

/**
 * The membership subset of a bundle.
 *
 * Built field by field ON PURPOSE — never spread. A spread would carry the
 * link-only fields (`icon`, `expires_at`, `creator_npub`, `label`) into every
 * future re-publish of the key list. The flip side is that a field added
 * upstream is silently dropped until it is named here, which is exactly how
 * `control_pk` went missing in the sibling app and made every post-split
 * community render empty.
 */
export function bundleToJoinMaterial(bundle: InviteBundle): JoinMaterial {
  const jm: JoinMaterial = {
    community_id: bundle.community_id,
    owner: bundle.owner,
    owner_salt: bundle.owner_salt,
    community_root: bundle.community_root,
    root_epoch: bundle.root_epoch,
    channels: bundle.channels.map((c) => ({
      id: c.id,
      key: c.key,
      epoch: c.epoch,
      name: c.name,
    })),
    relays: [...bundle.relays],
    name: bundle.name,
  };

  if (typeof bundle.control_pk === "string") jm.control_pk = bundle.control_pk;

  const heldRoots = bundle.held_roots;
  if (
    Array.isArray(heldRoots) &&
    heldRoots.every(
      (r) =>
        r &&
        typeof r === "object" &&
        typeof (r as { epoch?: unknown }).epoch === "number" &&
        typeof (r as { key?: unknown }).key === "string",
    )
  ) {
    jm.held_roots = (heldRoots as Array<{ epoch: number; key: string; control_pk?: string }>).map(
      (r) => ({
        epoch: r.epoch,
        key: r.key,
        // Per-entry: a prior epoch may be legacy while the current one is split.
        ...(typeof r.control_pk === "string" ? { control_pk: r.control_pk } : {}),
      }),
    );
  }

  if (typeof bundle.refounder === "string") jm.refounder = bundle.refounder;

  // Named explicitly, like everything else here — a spread would drag the
  // link-only fields along, and this function's whole discipline is that a
  // field you forget is a field that goes missing. An anchor is only a cache,
  // so a bundle without one costs the guest a slower first open, nothing more.
  const anchor = (bundle as { [k: string]: unknown })[PLEKTOS_ANCHOR_FIELD];
  const channelId = bundle.channels[0]?.id;
  if (typeof anchor === "string" && /^[0-9a-f]{64}$/.test(anchor) && channelId) {
    return withAnchor(jm, channelId, anchor);
  }

  return jm;
}
