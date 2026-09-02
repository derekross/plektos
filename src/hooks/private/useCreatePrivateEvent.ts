/**
 * Create a private event.
 *
 * The ordering is a correctness constraint, not a UX preference. Naively this
 * costs many signer round-trips, and the obvious order is wrong: publish the
 * event first and a failed key write leaves a host who has published a party
 * whose channel key they no longer hold — unrecoverable.
 *
 *   BLOCKING
 *     1. encrypt + sign the key list   the channel key is persisted FIRST
 *     2. sign the calendar seal        the event now exists
 *     -> navigate
 *
 *   BACKGROUND (first party only)
 *     3. the community metadata edition
 *
 * No per-party channel edition is published, deliberately: `channelsView`
 * renders a private channel from a held key without one, so omitting it means a
 * guest of one party cannot see that the others exist.
 */
import { useMutation } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { addToList, toJoinMaterial } from "@/concord/lib/communityList";
import { sealEdition } from "@/concord/lib/control";
import { KIND_SEAL_ENCRYPTED } from "@/concord/lib/kinds";
import { sealRumor, wrapSeal } from "@/concord/lib/stream";
import type { CalendarEventInput } from "@/lib/private/calendar";
import {
  PLEKTOS_EVENTS_MARKER,
  buildEventRumor,
  eventsCommunityGenesis,
  mintEventsCommunity,
  mintPartyChannel,
  withPartyChannel,
} from "@/lib/private/create";
import { PRIVATE_EVENT_RELAYS } from "@/lib/private/relays";
import { usePrivateEvents } from "./usePrivateEvent";
import { usePublishPrivateEventKeys } from "./usePrivateEventKeys";

export interface CreatePrivateEventInput {
  /** The party. Its description rides in the calendar rumor's content. */
  calendar: CalendarEventInput;
}

export interface CreatedPrivateEvent {
  /** A party is addressed by its CHANNEL, not its community. */
  channelIdHex: string;
  communityIdHex: string;
}

export function useCreatePrivateEvent() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { eventsHome } = usePrivateEvents();
  const publishKeys = usePublishPrivateEventKeys();

  return useMutation<CreatedPrivateEvent, Error, CreatePrivateEventInput>({
    mutationFn: async ({ calendar }) => {
      if (!user?.signer.nip44) {
        throw new Error(
          "Your signer can't encrypt yet (NIP-44 required). Try a different login, " +
            "or make this a public party.",
        );
      }

      const relays = [...PRIVATE_EVENT_RELAYS];
      const existing = eventsHome;
      const isFirst = !existing;
      const base = existing ?? mintEventsCommunity(user.pubkey, relays);

      const party = mintPartyChannel(calendar.title);
      const community = withPartyChannel(base, party);

      // 1. Keys first. If this fails we have published nothing.
      await publishKeys.mutateAsync((prev) => {
        const jm = toJoinMaterial(community);
        // The marker rides the index signature and survives the fragment
        // round trip, so the host's events community stays findable even
        // after Armada renames it.
        (jm as { [k: string]: unknown })[PLEKTOS_EVENTS_MARKER] = true;
        return addToList(prev, {
          community_id: community.idHex,
          seed: jm,
          current: jm,
          added_at: Date.now(),
        });
      });

      // 2. The event itself, into its own private channel.
      const rumor = buildEventRumor(party, calendar, user.pubkey);
      const seal = await sealRumor(rumor, KIND_SEAL_ENCRYPTED, party.stream, user.signer);
      await nostr.event(wrapSeal(seal, party.stream), {
        signal: AbortSignal.timeout(15_000),
        relays,
      });

      // 3. Community metadata, once, off the critical path. A failure here
      // leaves the community unnamed in other clients; it does not break it.
      if (isFirst) {
        void (async () => {
          try {
            const genesis = eventsCommunityGenesis(community, relays, user.pubkey);
            const wrap = await sealEdition(genesis.rumor, genesis.controlWrite, user.signer);
            await nostr.event(wrap, { signal: AbortSignal.timeout(15_000), relays });
          } catch (err) {
            console.error("private events: community genesis failed", err);
          }
        })();
      }

      return { channelIdHex: party.idHex, communityIdHex: community.idHex };
    },
  });
}
