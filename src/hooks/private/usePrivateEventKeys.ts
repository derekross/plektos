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
  emptyFragList,
  parseFragList,
  serializeFragList,
  type FragList,
} from "@/concord/lib/listFrag";
import { EMPTY_COMMUNITY_LIST, type CommunityList } from "@/concord/lib/communityList";
import { PRIVATE_EVENT_RELAYS } from "@/lib/private/relays";

export interface PrivateKeysState {
  list: CommunityList;
  /**
   * Fragment indices that exist on relays right now. A write that packs into
   * FEWER fragments than it read must explicitly empty the leftovers: they are
   * addressable events that stay put, and `defragment` unions whatever it
   * finds, so a fossil at a high index silently resurrects entries the user
   * removed.
   */
  fragIndices: number[];
  /**
   * True when fragments exist but could not be decrypted. NEVER publish in
   * this state — see guard (1) above.
   */
  decryptFailed: boolean;
}

const QUERY_KEY = ["private-event-keys"] as const;

const keysQueryKey = (pubkey: string) => [...QUERY_KEY, pubkey];

/** Minimal surface this module needs from the pool, so it is easy to call
 *  outside a component. */
interface Querier {
  query(
    filters: { kinds: number[]; authors: string[]; limit: number }[],
    opts: { signal: AbortSignal; relays: string[] },
  ): Promise<{ content: string; created_at: number; tags: string[][] }[]>;
}

interface Nip44Signer {
  pubkey: string;
  nip44: { decrypt(pubkey: string, data: string): Promise<string> };
}

/**
 * Read and decrypt the key list.
 *
 * Deliberately a plain function rather than only a hook body: the write path
 * has to re-read immediately before publishing, and `fetchQuery` needs a
 * `queryFn` it can call even when no component is currently mounting this
 * query. Registering it only inside `useQuery` is what produced a
 * "Missing queryFn" crash the first time anyone created a private event from a
 * page that never reads the list.
 */
export async function fetchPrivateEventKeys(
  nostr: Querier,
  user: Nip44Signer,
  signal: AbortSignal,
): Promise<PrivateKeysState> {
  const events = await nostr.query(
    [{ kinds: [KIND_COMMUNITY_LIST_FRAG], authors: [user.pubkey], limit: 100 }],
    { signal, relays: [...PRIVATE_EVENT_RELAYS] },
  );
  if (events.length === 0) {
    return { list: EMPTY_COMMUNITY_LIST, decryptFailed: false, fragIndices: [] };
  }

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
      frags.push(parseFragList(await user.nip44.decrypt(user.pubkey, ev.content)));
    } catch {
      anyFailed = true;
    }
  }

  // Fragments present but none opened: a decrypt problem, not an empty list.
  // Surfaced so the write path refuses rather than overwriting.
  const fragIndices = [...newest.keys()]
    .map((d) => Number(d))
    .filter((n) => Number.isInteger(n) && n >= 0);

  if (frags.length === 0) {
    return { list: EMPTY_COMMUNITY_LIST, decryptFailed: anyFailed, fragIndices };
  }
  return { list: defragment(frags), decryptFailed: anyFailed, fragIndices };
}

export function usePrivateEventKeys() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<PrivateKeysState>({
    queryKey: keysQueryKey(user?.pubkey ?? ""),
    queryFn: async (c) => {
      if (!user?.signer.nip44) {
        return { list: EMPTY_COMMUNITY_LIST, decryptFailed: false, fragIndices: [] };
      }
      return fetchPrivateEventKeys(
        nostr as unknown as Querier,
        { pubkey: user.pubkey, nip44: user.signer.nip44 },
        AbortSignal.any([c.signal, AbortSignal.timeout(8000)]),
      );
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

      // Re-read immediately before writing — guard (3). The queryFn is passed
      // explicitly: this runs from pages that never mount usePrivateEventKeys,
      // where nothing has registered one.
      const nip44 = user.signer.nip44;
      const fresh = await queryClient.fetchQuery<PrivateKeysState>({
        queryKey: keysQueryKey(user.pubkey),
        queryFn: () =>
          fetchPrivateEventKeys(
            nostr as unknown as Querier,
            { pubkey: user.pubkey, nip44 },
            AbortSignal.timeout(8000),
          ),
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

      const publishFrag = async (frag: FragList, index: number) => {
        const event = await user.signer.signEvent({
          kind: KIND_COMMUNITY_LIST_FRAG,
          content: await nip44.encrypt(user.pubkey, serializeFragList(frag)),
          tags: [["d", String(index)]],
          created_at: Math.floor(Date.now() / 1000),
        });
        await nostr.event(event, {
          signal: AbortSignal.timeout(10_000),
          relays: [...PRIVATE_EVENT_RELAYS],
        });
      };

      for (const [index, frag] of frags.entries()) await publishFrag(frag, index);

      // Retire any fragment index that existed before but is no longer used.
      // These are addressable events: leaving one behind means `defragment`
      // keeps unioning a stale copy, resurrecting entries the user removed.
      for (const stale of fresh.fragIndices.filter((i) => i >= frags.length)) {
        await publishFrag(emptyFragList(frags.length), stale);
      }

      return next;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
