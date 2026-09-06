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
import { fetchWraps, openEventWraps, streamFilter } from "@/lib/private/stream";
import { filterDeleted } from "@/lib/private/deletes";
import { resolvePrivateRelays } from "@/lib/private/relays";
import { PLEKTOS_EVENTS_MARKER, readAnchor } from "@/lib/private/create";
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
  /** Channel id -> calendar wrap id, for the parties that have one recorded. */
  anchors: Map<string, string>;
  isLoading: boolean;
} {
  const { data, isLoading } = usePrivateEventKeys();

  const { communities, eventsHome, anchors } = useMemo(() => {
    const anchors = new Map<string, string>();
    if (!data) return { communities: [] as Community[], eventsHome: undefined, anchors };
    const out: Community[] = [];
    let home: Community | undefined;
    for (const entry of liveEntries(data.list)) {
      // Fail closed: an entry that will not rehydrate (a corrupted owner
      // commitment, say) is dropped rather than rendered as a broken event.
      const community = rehydrateCommunity(entry);
      if (!community) continue;
      out.push(community);
      const current = entry.current as { [k: string]: unknown };
      if (current[PLEKTOS_EVENTS_MARKER] === true) home = community;
      // Anchors live on the entry, not the rehydrated Community — rehydration
      // builds a fixed shape and drops unknown fields — so they are read here,
      // at the one point where both are in hand.
      for (const ch of community.privateChannels) {
        const idHex = bytesToHex(ch.id);
        const anchor = readAnchor(current, idHex);
        if (anchor) anchors.set(idHex, anchor);
      }
    }
    return { communities: out, eventsHome: home, anchors };
  }, [data]);

  return { communities, eventsHome, anchors, isLoading };
}

export interface PrivateParty {
  community: Community;
  channelIdHex: string;
  name: string;
  /** Calendar wrap id, when the key list has one. See PLEKTOS_ANCHORS. */
  anchor?: string;
}

/**
 * Every party the user can open: one per private channel they hold a key for.
 *
 * Read straight from held keys rather than from the Control fold, because we
 * deliberately publish no per-party channel edition — the fold has nothing to
 * say about them, which is what keeps one party invisible to another's guests.
 */
export function usePrivateParties(): { parties: PrivateParty[]; isLoading: boolean } {
  const { communities, anchors, isLoading } = usePrivateEvents();

  const parties = useMemo(
    () =>
      communities.flatMap((community) =>
        community.privateChannels.map((ch) => {
          const channelIdHex = bytesToHex(ch.id);
          return {
            community,
            channelIdHex,
            name: ch.name,
            anchor: anchors.get(channelIdHex),
          };
        }),
      ),
    [communities, anchors],
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
  /**
   * False when the history walk stopped before the end. The UI must say so —
   * a party rendered from a partial stream has a wrong roster and a wrong
   * board, and looks exactly like a complete one.
   */
  complete: boolean;
}

/** Fetch and open one party's stream. */
export function usePrivateEventStream(channelIdHex: string | undefined) {
  const { nostr } = useNostr();
  const { party, community } = usePrivateParty(channelIdHex);
  const anchor = party?.anchor;

  return useQuery<PrivateStreamState>({
    // Two elements, deliberately. `usePrivateEventLive` pushes incoming wraps
    // into this cache with `setQueryData`, which matches EXACTLY — adding the
    // anchor here would write live messages into an entry nobody reads, and
    // live updates would stop with no error anywhere. The anchor is read fresh
    // inside the query instead; learning one later only adds a wrap, and the
    // 15s staleTime picks it up.
    queryKey: ["private-stream", channelIdHex ?? ""],
    queryFn: async (c) => {
      if (!community || !channelIdHex) return { opened: [], complete: false };
      // ONE deadline for the whole read, not one per request. NPool.query
      // resolves only when every routed relay has EOSEd, so a single slow relay
      // costs a page its full timeout; a per-page timeout would multiply that
      // by the page count instead of bounding it.
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(25_000)]);
      const relays = resolvePrivateRelays(community.relays);
      const query = (filters: Parameters<typeof nostr.query>[0], opts: { signal: AbortSignal; relays: string[] }) =>
        nostr.query(filters, opts);

      // The fold still matters: it carries the community's metadata and its
      // relay set, and would carry a channel definition if one ever landed.
      const groups = controlGroups(community);
      const control = await fetchWraps(
        query as never,
        { kinds: [KIND_WRAP], authors: groups.map((g) => g.pk) },
        { relays, signal, maxPages: 8 },
      );
      const folded = foldControlState(
        openControlWraps(control.wraps, groups),
        community.id,
        community.owner,
      );

      const channel = channelsView(community, folded).find((ch) => ch.idHex === channelIdHex);
      if (!channel) return { opened: [], complete: false };

      const streams = channel.streams.map((s) => ({
        stream: s.group,
        channelIdHex: channel.idHex,
        epoch: s.epoch,
      }));

      const base = streamFilter(streams);
      const history = await fetchWraps(
        query as never,
        { kinds: base.kinds, authors: base.authors },
        { relays, signal },
      );

      // The anchor, fetched alongside rather than hoped for. The calendar rumor
      // is the OLDEST wrap in the stream and `limit` returns the newest, so it
      // is the first thing a truncated read loses — and losing it renders the
      // party as one that does not exist. By id the lookup is O(1) and immune
      // to a flood, and it costs one extra filter on a request already in
      // flight. No `authors` guard is needed: the id is a hash commitment, and
      // `openEventWraps` refuses any wrap not authored by a stream key.
      let wraps = history.wraps;
      if (anchor && !wraps.some((w) => w.id === anchor)) {
        const pinned = await nostr.query([{ ids: [anchor] }], { signal, relays });
        wraps = [...wraps, ...pinned];
      }

      // Deletes are applied here, once, so the calendar, roster, board and
      // thread all inherit the same author-checked rule.
      return {
        opened: filterDeleted(openEventWraps(wraps, streams)),
        channel,
        complete: history.complete && control.complete,
      };
    },
    enabled: Boolean(community && channelIdHex),
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
