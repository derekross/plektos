/**
 * Minting a private event.
 *
 * A host has ONE Concord community — "Plektos Events" — and each party is a
 * PRIVATE CHANNEL inside it. The calendar rumor in that channel is the event.
 *
 * The obvious alternative, one community per party, was built first and
 * abandoned: Armada renders every entry in the shared key list as a community,
 * so a host's sidebar accumulated one community per party, permanently.
 *
 * Isolation survives the change, and that is the part worth being careful
 * about. A private channel's key is independent of the community root, and an
 * invite delivers only the ONE channel it is for. `channelsView` renders a
 * private channel from a held key even when the Control Plane has no
 * definition for it, so we deliberately publish **no per-party channel
 * edition** — a guest of one party therefore cannot even see that the others
 * exist, rather than merely being unable to read them.
 *
 * What a guest does get from the community root: the Control Plane and any
 * public channel. We create none, so that is an empty set today. It is still a
 * real difference from the old mapping — one root now covers every party, and
 * a rekey would affect all of them at once.
 */
import { bytesToHex, channelGroupKey, random32, type GroupKey } from "@/concord/lib/derive";
import { mintCommunity } from "@/concord/lib/community";
import { buildMetadataEdition, currentControlWriteGroup } from "@/concord/lib/control";
import { buildRumor, channelBindingTags } from "@/concord/lib/stream";
import type { NostrRumor } from "@/concord/lib/rumor";
import type { Community, PrivateChannelKey } from "@/concord/lib/types";
import { buildCalendarTags, type CalendarEventInput } from "./calendar";

/** The host's one community. */
export const PLEKTOS_EVENTS_NAME = "Plektos Events";

/**
 * Marks the host's events community inside their key list.
 *
 * Rides `JoinMaterial`'s index signature, which `listFrag` preserves through
 * its `extra` buckets — the same mechanism that keeps Armada's own unknown
 * fields intact. Matching on the NAME instead would break the moment a user
 * renamed it in Armada.
 */
export const PLEKTOS_EVENTS_MARKER = "plektos_events";

/**
 * Mint the host's events community.
 *
 * `mintCommunity` also hands back a `generalChannelId`; we ignore it. A public
 * `#general` would be readable by every guest of every party, which is exactly
 * the leak this mapping exists to avoid.
 */
export function mintEventsCommunity(ownerPubkeyHex: string, relays: string[]): Community {
  const { community } = mintCommunity(PLEKTOS_EVENTS_NAME, ownerPubkeyHex, relays);
  return community;
}

export interface PartyChannel {
  key: PrivateChannelKey;
  idHex: string;
  /** The stream carrying the event, its RSVPs, board and chat. */
  stream: GroupKey;
}

/** Mint a private channel for one party. Pure and local — no signer, no network. */
export function mintPartyChannel(name: string): PartyChannel {
  const id = random32();
  const key = random32();
  const epoch = 0n;
  return {
    key: { id, key, epoch, name },
    idHex: bytesToHex(id),
    // A PRIVATE channel derives from its own independent key, NOT the
    // community root — which is what keeps one party unreadable to another's
    // guests even though both hold the same root.
    stream: channelGroupKey(key, id, epoch),
  };
}

/** Attach a freshly minted party channel to the community it belongs to. */
export function withPartyChannel(community: Community, party: PartyChannel): Community {
  return { ...community, privateChannels: [...community.privateChannels, party.key] };
}

/** The community's metadata edition. Written once, when the community is minted. */
export function eventsCommunityGenesis(
  community: Community,
  relays: string[],
  ownerPubkey: string,
): { rumor: NostrRumor; controlWrite: GroupKey } {
  return {
    rumor: buildMetadataEdition(
      community.id,
      {
        name: PLEKTOS_EVENTS_NAME,
        description: "Private parties hosted on Plektos.",
        relays,
      },
      { actorPubkey: ownerPubkey, version: 1n },
    ),
    controlWrite: currentControlWriteGroup(community),
  };
}

/**
 * The calendar rumor that IS the event.
 *
 * `d` is stable across edits: republishing with the same `d` is how an edit
 * works, and the fold keeps the newest per `(author, d)`.
 */
export function buildEventRumor(
  party: PartyChannel,
  input: CalendarEventInput,
  ownerPubkey: string,
): NostrRumor {
  return buildRumor({
    kind: input.kind,
    content: input.description ?? "",
    pubkey: ownerPubkey,
    ms: Date.now(),
    tags: [
      ...channelBindingTags(party.idHex, party.key.epoch),
      ...buildCalendarTags(input),
    ],
  });
}
