/**
 * The user's private-event keys: kind-33302 fragments, NIP-44 encrypted to
 * self, one addressable event per fragment with the fragment index as its `d`.
 *
 * This is the whole capability. Losing it means losing every private event the
 * user can open, so the write path below carries three guards that exist
 * because of real failure modes:
 *
 *  1. `decryptFailed` is a THIRD state, distinct from "empty". A signer that
 *     cannot decrypt looks exactly like a user with no private events, and if
 *     a write treats the two the same it replaces the whole document with one
 *     entry and destroys every other key the user holds.
 *  2. The mutation takes a REDUCER, not a list. Callers cannot accidentally
 *     publish a stale snapshot they captured before an unrelated change.
 *  3. It re-reads immediately before writing, so a concurrent change on another
 *     device is merged rather than clobbered.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { KIND_COMMUNITY_LIST_FRAG } from "@/concord/lib/kinds";
import {
  defragment,
  fragment,
  parseFragList,
  serializeFragList,
  type FragList,
} from "@/concord/lib/listFrag";
import { EMPTY_COMMUNITY_LIST, type CommunityList } from "@/concord/lib/communityList";
import { PRIVATE_EVENT_RELAYS } from "@/lib/private/relays";

export interface PrivateKeysState {
  list: CommunityList;
  /**
   * True when fragments exist but could not be decrypted. NEVER publish in
   * this state — see guard (1) above.
   */
  decryptFailed: boolean;
}

const QUERY_KEY = ["private-event-keys"] as const;

export function usePrivateEventKeys() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<PrivateKeysState>({
    queryKey: [...QUERY_KEY, user?.pubkey ?? ""],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(6000)]);
      if (!user?.signer.nip44) return { list: EMPTY_COMMUNITY_LIST, decryptFailed: false };

      const events = await nostr.query(
        [{ kinds: [KIND_COMMUNITY_LIST_FRAG], authors: [user.pubkey], limit: 100 }],
        { signal, relays: [...PRIVATE_EVENT_RELAYS] },
      );
      if (events.length === 0) return { list: EMPTY_COMMUNITY_LIST, decryptFailed: false };

      // Newest event per `d` (fragment index) wins — these are addressable.
      const newest = new Map<string, (typeof events)[number]>();
      for (const ev of events) {
        const d = ev.tags.find((t) => t[0] === "d")?.[1] ?? "0";
        const prev = newest.get(d);
        if (!prev || prev.created_at < ev.created_at) newest.set(d, ev);
      }

      const frags: FragList[] = [];
      let anyFailed = false;
      for (const ev of newest.values()) {
        try {
          frags.push(parseFragList(await user.signer.nip44.decrypt(user.pubkey, ev.content)));
        } catch {
          anyFailed = true;
        }
      }

      // Fragments present but none opened: a decrypt problem, not an empty
      // list. Surfaced so the write path refuses rather than overwriting.
      if (frags.length === 0) return { list: EMPTY_COMMUNITY_LIST, decryptFailed: anyFailed };
      return { list: defragment(frags), decryptFailed: anyFailed };
    },
    enabled: Boolean(user?.pubkey),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Publish a change to the key list.
 *
 * Takes a reducer so the caller cannot publish a stale snapshot, and re-reads
 * before writing so a concurrent change on another device merges instead of
 * being clobbered.
 */
export function usePublishPrivateEventKeys() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reduce: (prev: CommunityList) => CommunityList) => {
      if (!user?.signer.nip44) throw new Error("This signer cannot encrypt (NIP-44 required).");

      // Re-read immediately before writing — guard (3).
      const fresh = await queryClient.fetchQuery<PrivateKeysState>({
        queryKey: [...QUERY_KEY, user.pubkey],
        staleTime: 0,
      });
      if (fresh.decryptFailed) {
        throw new Error(
          "Your existing private-event keys could not be decrypted. Refusing to " +
            "publish, because doing so would replace them.",
        );
      }

      const next = reduce(fresh.list);
      const frags = fragment(next);

      for (const [index, frag] of frags.entries()) {
        const event = await user.signer.signEvent({
          kind: KIND_COMMUNITY_LIST_FRAG,
          content: await user.signer.nip44.encrypt(user.pubkey, serializeFragList(frag)),
          tags: [["d", String(index)]],
          created_at: Math.floor(Date.now() / 1000),
        });
        await nostr.event(event, {
          signal: AbortSignal.timeout(10_000),
          relays: [...PRIVATE_EVENT_RELAYS],
        });
      }
      return next;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
