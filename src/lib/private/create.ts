/**
 * Minting a private event.
 *
 * A private Plektos event IS a Concord community with a single channel. The
 * calendar rumor inside that channel is the event; RSVPs, the sign-up board and
 * chat are further rumors in the same stream. That mapping is what makes the
 * event readable by Armada and the rest of the Concord family — verified end to
 * end before any of this was written: Plektos mints, Armada renders and RSVPs,
 * Plektos reads the RSVP back.
 *
 * Genesis publishes exactly two owner-signed control editions (metadata and the
 * `general` channel) plus the calendar rumor. The frightening parts of CORD-04
 * — delegation, roles, grants, authority citations — are all read-side and all
 * short-circuit here, because the host IS the owner: `citationOk` returns true
 * on owner identity alone, and both editions are version 1 with no prevHash, so
 * the fold anchors without a chain walk.
 */
import { channelGroupKey, bytesToHex, type GroupKey } from "@/concord/lib/derive";
import { mintCommunity } from "@/concord/lib/community";
import {
  buildChannelEdition,
  buildMetadataEdition,
  currentControlWriteGroup,
} from "@/concord/lib/control";
import { buildRumor, channelBindingTags } from "@/concord/lib/stream";
import type { NostrRumor } from "@/concord/lib/rumor";
import type { Community } from "@/concord/lib/types";
import { buildCalendarTags, type CalendarEventInput } from "./calendar";

/** The channel every private event gets. Public within the community — and the
 * community has exactly one event, so every member is already a guest. This is
 * also Armada's own genesis shape, which is what makes it render there. */
export const GENERAL_CHANNEL_NAME = "general";

export interface MintedPrivateEvent {
  community: Community;
  channelId: Uint8Array;
  channelIdHex: string;
  /** The stream that carries the event, its RSVPs, board and chat. */
  stream: GroupKey;
  /** The control-plane write key. Only the owner holds this. */
  controlWrite: GroupKey;
}

/**
 * Mint the keys for a new private event. Pure and local — no signer, no
 * network. Roughly four HKDF derivations and two point multiplications.
 */
export function mintPrivateEvent(
  title: string,
  ownerPubkeyHex: string,
  relays: string[],
): MintedPrivateEvent {
  const { community, generalChannelId } = mintCommunity(title, ownerPubkeyHex, relays);
  return {
    community,
    channelId: generalChannelId,
    channelIdHex: bytesToHex(generalChannelId),
    // A PUBLIC channel derives its stream from the community root, so every
    // member reads it with the key the invite already gave them.
    stream: channelGroupKey(community.root, generalChannelId, community.rootEpoch),
    controlWrite: currentControlWriteGroup(community),
  };
}

/** The two genesis control editions, unsigned. Both version 1, owner-authored. */
export function genesisEditions(
  minted: MintedPrivateEvent,
  meta: { name: string; description?: string; relays: string[] },
  ownerPubkey: string,
): { metadata: NostrRumor; channel: NostrRumor } {
  const common = { actorPubkey: ownerPubkey, version: 1n };
  return {
    metadata: buildMetadataEdition(minted.community.id, meta, common),
    channel: buildChannelEdition(
      minted.channelId,
      { name: GENERAL_CHANNEL_NAME, private: false },
      common,
    ),
  };
}

/**
 * The calendar rumor that IS the event.
 *
 * `d` is stable across edits: republishing with the same `d` is how an edit
 * works, and the fold keeps the newest per `(author, d)`.
 */
export function buildEventRumor(
  minted: MintedPrivateEvent,
  input: CalendarEventInput,
  ownerPubkey: string,
): NostrRumor {
  return buildRumor({
    // 31923 when the input carries a time, 31922 for a whole-day event — the
    // caller decides, exactly as the public path does.
    kind: input.kind,
    content: input.description ?? "",
    pubkey: ownerPubkey,
    ms: Date.now(),
    tags: [
      ...channelBindingTags(minted.channelIdHex, minted.community.rootEpoch),
      ...buildCalendarTags(input),
    ],
  });
}
