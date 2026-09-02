/**
 * Reading a private event.
 *
 * A party is a private CHANNEL, so it is addressed by channel id throughout —
 * resolved entirely from the local key list, never by a relay lookup. One host
 * community may hold many parties; a guest's key list holds only the channels
 * they were invited to.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { channelsView } from "@/concord/lib/community";
import { liveEntries, rehydrateCommunity } from "@/concord/lib/communityList";
import { controlGroups, foldControlState, openControlWraps } from "@/concord/lib/control";
import { bytesToHex } from "@/concord/lib/derive";
import { KIND_WRAP } from "@/concord/lib/kinds";
import type { Channel, Community } from "@/concord/lib/types";
import type { OpenedEvent } from "@/concord/lib/stream";
import { openEventWraps } from "@/lib/private/stream";
import { resolvePrivateRelays } from "@/lib/private/relays";
import { PLEKTOS_EVENTS_MARKER } from "@/lib/private/create";
import { usePrivateEventKeys } from "./usePrivateEventKeys";

/**
 * Every community the user holds keys for, plus which one is this app's own
 * events home.
 *
 * The marker lives in the list entry's JoinMaterial, not on the rehydrated
 * Community (rehydration builds a fixed shape and drops unknown fields), so it
 * has to be read here, at the only point where both are in hand.
 */
export function usePrivateEvents(): {
  communities: Community[];
  /** The host's "Plektos Events" community, if they have one yet. */
  eventsHome?: Community;
  isLoading: boolean;
} {
  const { data, isLoading } = usePrivateEventKeys();

  const { communities, eventsHome } = useMemo(() => {
    if (!data) return { communities: [] as Community[], eventsHome: undefined };
    const out: Community[] = [];
    let home: Community | undefined;
    for (const entry of liveEntries(data.list)) {
      // Fail closed: an entry that will not rehydrate (a corrupted owner
      // commitment, say) is dropped rather than rendered as a broken event.
      const community = rehydrateCommunity(entry);
      if (!community) continue;
      out.push(community);
      if ((entry.current as { [k: string]: unknown })[PLEKTOS_EVENTS_MARKER] === true) {
        home = community;
      }
    }
    return { communities: out, eventsHome: home };
  }, [data]);

  return { communities, eventsHome, isLoading };
}

export interface PrivateParty {
  community: Community;
  channelIdHex: string;
  name: string;
}

/**
 * Every party the user can open: one per private channel they hold a key for.
 *
 * Read straight from held keys rather than from the Control fold, because we
 * deliberately publish no per-party channel edition — the fold has nothing to
 * say about them, which is what keeps one party invisible to another's guests.
 */
export function usePrivateParties(): { parties: PrivateParty[]; isLoading: boolean } {
  const { communities, isLoading } = usePrivateEvents();

  const parties = useMemo(
    () =>
      communities.flatMap((community) =>
        community.privateChannels.map((ch) => ({
          community,
          channelIdHex: bytesToHex(ch.id),
          name: ch.name,
        })),
      ),
    [communities],
  );

  return { parties, isLoading };
}

export function usePrivateParty(channelIdHex: string | undefined) {
  const { parties, isLoading } = usePrivateParties();
  const { user } = useCurrentUser();

  const party = useMemo(
    () => parties.find((p) => p.channelIdHex === channelIdHex),
    [parties, channelIdHex],
  );

  return {
    party,
    community: party?.community,
    isLoading,
    /** The host. Salt-verified by `rehydrateCommunity`, not a claim in an event. */
    isHost: Boolean(user && party && user.pubkey === party.community.owner),
  };
}

export interface PrivateStreamState {
  opened: OpenedEvent[];
  /** The resolved channel, carried out so writers need not re-resolve it. */
  channel?: Channel;
}

/** Fetch and open one party's stream. */
export function usePrivateEventStream(channelIdHex: string | undefined) {
  const { nostr } = useNostr();
  const { community } = usePrivateParty(channelIdHex);

  return useQuery<PrivateStreamState>({
    queryKey: ["private-stream", channelIdHex ?? ""],
    queryFn: async (c) => {
      if (!community || !channelIdHex) return { opened: [] };
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(12_000)]);
      const relays = resolvePrivateRelays(community.relays);

      // The fold still matters: it carries the community's metadata and its
      // relay set, and would carry a channel definition if one ever landed.
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

      const channel = channelsView(community, folded).find((ch) => ch.idHex === channelIdHex);
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
    enabled: Boolean(community && channelIdHex),
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
