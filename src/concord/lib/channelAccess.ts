/**
 * Who may read a Private Channel — CORD-03/04/06, no extension involved.
 *
 * CORD-03 defines the two channel kinds by exactly this question: a Public
 * Channel derives its key from the `community_root` and is "readable by every
 * member"; a Private Channel is "readable only by granted role-holders", its
 * key "an independent random secret, delivered on grant and rekeyed on
 * removal (CORD-06)". CORD-04 §2 carries the binding that names those
 * role-holders — a Role's `scope: {kind:"channel", channel_id}` — and CORD-06
 * §1 works the pair as its motivating example: "removing a role (`Tester`)
 * with access to a private channel (`#testers`)".
 *
 * So the roles scoped to a channel ARE its access list. Read access is still
 * enforced by key possession alone (CORD-04 §1) and nothing here grants it;
 * this is the routing that decides who a key is delivered TO on grant, and who
 * a rekey keeps on revoke. A client that ignores the routing cannot read
 * without the key, and a key holder can always leak — which is what the
 * rekey-on-revoke makes temporary.
 */

import { bytesToHex } from "./derive";
import { byDisplayOrder, rolesOf, type CommunityRoles, type Role } from "./roles";

/**
 * The Roles conferring read access to `channelIdHex`, in display order.
 *
 * A Private Channel with none is readable by nobody but the owner and whoever
 * already holds the key. That is a degenerate configuration rather than an
 * "open" one: a private channel readable by every member is strictly worse
 * than a public one (an independent key to deliver, rotate and lose, for the
 * audience the community root already covers), so clients should not create
 * it — but a channel arriving that way from elsewhere still reads correctly
 * here, and its existing key holders keep reading it.
 */
export function channelRoles(roster: CommunityRoles | undefined, channelIdHex: string): Role[] {
  const wanted = channelIdHex.toLowerCase();
  return (roster?.roles ?? [])
    .filter((r) => r.scope.kind === "channel" && r.scope.channelId.toLowerCase() === wanted)
    .sort(byDisplayOrder);
}

/** {@link channelRoles}, by id. */
export function channelRoleIds(roster: CommunityRoles | undefined, channelIdHex: string): string[] {
  return channelRoles(roster, channelIdHex).map((r) => r.roleId);
}

/**
 * Is `memberHex` entitled to `channelIdHex`'s key? The owner always is
 * (position 0, supreme and unremovable — CORD-04 §2).
 *
 * `withRoleIds`/`withoutRoleIds` overlay a Grant that was JUST published, so a
 * caller can settle key custody against the change it just made rather than
 * against a fold that lags its own publish.
 */
export function isEntitled(
  roster: CommunityRoles | undefined,
  ownerHex: string | undefined,
  memberHex: string,
  channelIdHex: string,
  overlay?: { withRoleIds?: string[]; withoutRoleIds?: string[] },
): boolean {
  if (memberHex === ownerHex) return true;
  if (!roster) return false;
  const held = new Set(rolesOf(roster, memberHex).map((r) => r.roleId));
  for (const id of overlay?.withRoleIds ?? []) held.add(id);
  for (const id of overlay?.withoutRoleIds ?? []) held.delete(id);
  return channelRoleIds(roster, channelIdHex).some((id) => held.has(id));
}

/**
 * Who an invite bundle is FOR, which is what decides the Private Channel keys
 * it may carry.
 *
 * A **link** has no recipient. CORD-05 §2 puts it in plaintext channels and
 * says "anyone the link reaches can join", so its audience holds no Role by
 * construction and is entitled to no Private Channel at all.
 *
 * A **member** is a specific npub whose entitlement is computable, so the
 * bundle carries exactly the channels they are already a granted role-holder
 * of. `overlay` settles that against a Grant this client JUST published, since
 * the fold lags its own publish — a role-grant vend judges the member as the
 * grant leaves them, not as the stale fold still sees them.
 */
export type VendAudience =
  | { kind: "link" }
  | {
      kind: "member";
      roster: CommunityRoles | undefined;
      ownerHex: string | undefined;
      memberHex: string;
      overlay?: { withRoleIds?: string[]; withoutRoleIds?: string[] };
    };

/**
 * The held Private Channel keys an invite bundle may carry.
 *
 * CORD-05 §1 makes `channels` "the granted Channels" — the creator's CHOICE of
 * what a given invite hands over. The choice is still bounded by what the
 * Channel is: CORD-03 §1 defines a Private Channel as "readable only by
 * granted role-holders", with its key "delivered on grant", and admits no
 * third kind of channel to land in. A bundle handing a key to someone holding
 * none of the Channel's scoped Roles (CORD-04 §2) makes that definition false
 * for every member — so entitlement is the ceiling, and `only`/`exclude`
 * narrow beneath it.
 *
 * That CORD-05 §6 gates a Direct Invite behind no permission ("any keyholder
 * can whisper keys") is about what the protocol can PREVENT, not about what a
 * client should hand over when a user clicks Invite. An unentitled recipient
 * is a leak whether or not the wire format could carry it.
 *
 * A roster that has not LOADED is a different thing from one that says
 * "entitled to nothing", so it throws rather than quietly vending nothing.
 */
export function vendableChannels<T extends { id: Uint8Array }>(
  held: readonly T[],
  audience: VendAudience,
  opts?: { only?: ReadonlySet<string>; exclude?: ReadonlySet<string> },
): T[] {
  if (held.length === 0) return [];
  if (audience.kind === "link") return [];
  if (!audience.roster) {
    throw new Error("Still loading this community's roles; try again in a moment.");
  }
  const { roster, ownerHex, memberHex, overlay } = audience;
  return held.filter((ch) => {
    const idHex = bytesToHex(ch.id);
    if (opts?.exclude?.has(idHex)) return false;
    if (opts?.only && !opts.only.has(idHex)) return false;
    return isEntitled(roster, ownerHex, memberHex, idHex, overlay);
  });
}

/**
 * The channels whose access for `memberHex` HINGES on `roleId` — they are
 * entitled holding it and not without it — split by whether this client holds
 * the channel key.
 *
 * The split is the point. Granting vends only what I can vend and revoking
 * rotates only what I can rotate, but a channel in `unheld` still changed
 * hands and still needs a rotation by someone who holds it. Deriving the list
 * from the keys in my own pocket instead makes that case invisible, so a
 * revoke reports success while the target keeps reading.
 */
export function channelsHingingOn(
  roster: CommunityRoles,
  ownerHex: string | undefined,
  memberHex: string,
  roleId: string,
  channels: ReadonlyArray<{ idHex: string; heldByMe: boolean }>,
): { held: string[]; unheld: string[] } {
  const held: string[] = [];
  const unheld: string[] = [];
  for (const ch of channels) {
    if (!isEntitled(roster, ownerHex, memberHex, ch.idHex, { withRoleIds: [roleId] })) continue;
    if (isEntitled(roster, ownerHex, memberHex, ch.idHex, { withoutRoleIds: [roleId] })) continue;
    (ch.heldByMe ? held : unheld).push(ch.idHex);
  }
  return { held, unheld };
}
