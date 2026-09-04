/**
 * The host's invite list: kind 13303, NIP-44 encrypted to self.
 *
 * Deliberately the same shape as `usePrivateEventKeys`, including the guard
 * that looks like paranoia and is not: **`decryptFailed` is a third state,
 * distinct from "empty".** A signer that cannot decrypt looks exactly like a
 * host with no invites, and a write that treats the two the same replaces the
 * whole document with one entry — here that would destroy the `signer_sk` of
 * every outstanding link, leaving them working and permanently unrevocable.
 *
 * Unlike the key list this is one replaceable event rather than fragments.
 * Entries are ~200 bytes, so a host would need thousands before size mattered,
 * and the fragment machinery brings a stale-index failure mode that is not
 * worth inheriting for that.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { KIND_INVITE_LIST } from "@/concord/lib/kinds";
import {
  EMPTY_INVITE_LIST,
  parseInviteList,
  serializeInviteList,
  type InviteList,
} from "@/lib/private/inviteList";
import { PRIVATE_EVENT_RELAYS } from "@/lib/private/relays";

export interface InviteListState {
  list: InviteList;
  /** True when an event exists but would not decrypt. Never publish in this state. */
  decryptFailed: boolean;
}

const QUERY_KEY = ["private-invite-list"] as const;
const listKey = (pubkey: string) => [...QUERY_KEY, pubkey];

interface Querier {
  query(
    filters: { kinds: number[]; authors: string[]; limit: number }[],
    opts: { signal: AbortSignal; relays: string[] },
  ): Promise<{ content: string; created_at: number }[]>;
}

interface Nip44Signer {
  pubkey: string;
  nip44: { decrypt(pubkey: string, data: string): Promise<string> };
}

/**
 * Read and decrypt the invite list.
 *
 * A plain function as well as a hook body, for the same reason as the key
 * list: the write path re-reads immediately before publishing, and
 * `fetchQuery` needs a `queryFn` it can call from a page that never mounted
 * the query.
 */
export async function fetchInviteList(
  nostr: Querier,
  user: Nip44Signer,
  signal: AbortSignal,
): Promise<InviteListState> {
  const events = await nostr.query(
    [{ kinds: [KIND_INVITE_LIST], authors: [user.pubkey], limit: 5 }],
    { signal, relays: [...PRIVATE_EVENT_RELAYS] },
  );
  if (events.length === 0) return { list: EMPTY_INVITE_LIST, decryptFailed: false };

  // Replaceable, so newest wins — but relays disagree about which they kept.
  const newest = [...events].sort((a, b) => b.created_at - a.created_at)[0];
  try {
    return { list: parseInviteList(await user.nip44.decrypt(user.pubkey, newest.content)), decryptFailed: false };
  } catch {
    return { list: EMPTY_INVITE_LIST, decryptFailed: true };
  }
}

export function useInviteList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery<InviteListState>({
    queryKey: listKey(user?.pubkey ?? ""),
    queryFn: async (c) => {
      if (!user?.signer.nip44) return { list: EMPTY_INVITE_LIST, decryptFailed: false };
      return fetchInviteList(
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
 * Publish a change to the invite list.
 *
 * Reducer rather than a value, and a re-read before writing, so a link minted
 * on another device is merged instead of clobbered.
 */
export function usePublishInviteList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reduce: (prev: InviteList) => InviteList) => {
      if (!user?.signer.nip44) throw new Error("This signer cannot encrypt (NIP-44 required).");
      const nip44 = user.signer.nip44;

      const fresh = await queryClient.fetchQuery<InviteListState>({
        queryKey: listKey(user.pubkey),
        queryFn: () =>
          fetchInviteList(
            nostr as unknown as Querier,
            { pubkey: user.pubkey, nip44 },
            AbortSignal.timeout(8000),
          ),
        staleTime: 0,
      });
      if (fresh.decryptFailed) {
        throw new Error(
          "Your existing invite links could not be decrypted. Refusing to publish, " +
            "because doing so would leave every outstanding link working and " +
            "impossible to revoke.",
        );
      }

      const next = reduce(fresh.list);
      const event = await user.signer.signEvent({
        kind: KIND_INVITE_LIST,
        content: await nip44.encrypt(user.pubkey, serializeInviteList(next)),
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      });
      await nostr.event(event, {
        signal: AbortSignal.timeout(10_000),
        relays: [...PRIVATE_EVENT_RELAYS],
      });
      return next;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
