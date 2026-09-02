/**
 * Reading a private event.
 *
 * Three layers, each a separate query so they cache and refetch independently:
 *
 *   usePrivateEvents()        every private event the user holds keys for
 *   usePrivateEvent(cid)      one of them, rehydrated
 *   usePrivateEventStream(cid) its opened rumors (event, RSVPs, board, chat)
 *
 * A private event has no addressable coordinate and no naddr, so it is
 * identified throughout by its community id — resolved entirely from the local
 * key list, never by a relay lookup.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { channelsView } from "@/concord/lib/community";
import { liveEntries, rehydrateCommunity } from "@/concord/lib/communityList";
import { controlGroups, foldControlState, openControlWraps } from "@/concord/lib/control";
import { KIND_WRAP } from "@/concord/lib/kinds";
import type { Channel, Community } from "@/concord/lib/types";
import type { OpenedEvent } from "@/concord/lib/stream";
import { openEventWraps } from "@/lib/private/stream";
import { resolvePrivateRelays } from "@/lib/private/relays";
import { usePrivateEventKeys } from "./usePrivateEventKeys";

/** Every private event the user holds keys for. Local only — no network. */
export function usePrivateEvents(): { communities: Community[]; isLoading: boolean } {
  const { data, isLoading } = usePrivateEventKeys();

  const communities = useMemo(() => {
    if (!data) return [];
    // Fail closed: an entry that will not rehydrate (a corrupted owner
    // commitment, say) is dropped rather than rendered as a broken event.
    return liveEntries(data.list)
      .map((entry) => rehydrateCommunity(entry))
      .filter((c): c is Community => Boolean(c));
  }, [data]);

  return { communities, isLoading };
}

export function usePrivateEvent(communityIdHex: string | undefined) {
  const { communities, isLoading } = usePrivateEvents();
  const { user } = useCurrentUser();

  const community = useMemo(
    () => communities.find((c) => c.idHex === communityIdHex),
    [communities, communityIdHex],
  );

  return {
    community,
    isLoading,
    /** The host. Salt-verified by `rehydrateCommunity`, not a claim in an event. */
    isHost: Boolean(user && community && user.pubkey === community.owner),
  };
}

export interface PrivateStreamState {
  opened: OpenedEvent[];
  /**
   * The resolved channel, carried out so writers do not have to re-fold the
   * control plane to find where to publish. A PUBLIC channel's id exists only
   * in its vsk=2 edition, so re-deriving it without the fold is impossible —
   * an earlier attempt to do so silently produced no channel at all.
   */
  channel?: Channel;
}

/**
 * Fetch and open the event's stream.
 *
 * The channel is discovered through the control fold rather than assumed: a
 * PUBLIC channel's id only exists in its vsk=2 edition, and its stream then
 * derives from the community root for every held epoch, so history spans
 * rekeys for free.
 */
export function usePrivateEventStream(communityIdHex: string | undefined) {
  const { nostr } = useNostr();
  const { community } = usePrivateEvent(communityIdHex);

  return useQuery<PrivateStreamState>({
    queryKey: ["private-stream", communityIdHex ?? ""],
    queryFn: async (c) => {
      if (!community) return { opened: [] };
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(12_000)]);
      const relays = resolvePrivateRelays(community.relays);

      const groups = controlGroups(community);
      const controlWraps = await nostr.query(
        [{ kinds: [KIND_WRAP], authors: groups.map((g) => g.pk), limit: 200 }],
        { signal, relays },
      );
      const folded = foldControlState(
        openControlWraps(controlWraps, groups),
        community.id,
        community.owner,
      );

      // One community, one channel — but take it from the view rather than
      // assuming, so a renamed or re-created channel still resolves.
      const channel = channelsView(community, folded)[0];
      if (!channel) return { opened: [] };

      const streams = channel.streams.map((s) => ({
        stream: s.group,
        channelIdHex: channel.idHex,
        epoch: s.epoch,
      }));

      const wraps = await nostr.query(
        [{ kinds: [KIND_WRAP], authors: streams.map((s) => s.stream.pk), limit: 500 }],
        { signal, relays },
      );

      return { opened: openEventWraps(wraps, streams), channel };
    },
    enabled: Boolean(community),
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
