/**
 * Chat inside a private event.
 *
 * Kind-9 rumors in the same stream as the event. This deliberately does NOT
 * reuse `useEventComments`: that publishes NIP-22 kind 1111 in the clear, and
 * a public comment whose `e` tag names a private rumor id leaks both the id and
 * the fact that the event exists.
 */
import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { KIND_DELETE, KIND_MESSAGE, KIND_SEAL_ENCRYPTED } from "@/concord/lib/kinds";
import { buildRumor, channelBindingTags, sealRumor, wrapSeal } from "@/concord/lib/stream";
import { resolvePrivateRelays } from "@/lib/private/relays";
import { usePrivateParty, usePrivateEventStream } from "./usePrivateEvent";

export interface PrivateMessage {
  id: string;
  pubkey: string;
  content: string;
  ms: number;
}

export function usePrivateEventChat(channelIdHex: string | undefined) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { community } = usePrivateParty(channelIdHex);
  const { data, isLoading } = usePrivateEventStream(channelIdHex);
  const queryClient = useQueryClient();

  const messages = useMemo<PrivateMessage[]>(() => {
    const opened = data?.opened ?? [];

    // A kind-5 delete is honoured only from the message's own author. Any
    // keyholder can publish a delete into a shared stream, so trusting them
    // all would let one guest erase the whole thread.
    const deleted = new Set<string>();
    const authorOf = new Map<string, string>();
    for (const ev of opened) {
      if (ev.kind === KIND_MESSAGE) authorOf.set(ev.rumorId, ev.author);
    }
    for (const ev of opened) {
      if (ev.kind !== KIND_DELETE) continue;
      for (const tag of ev.tags) {
        if (tag[0] === "e" && authorOf.get(tag[1]) === ev.author) deleted.add(tag[1]);
      }
    }

    return opened
      .filter((ev) => ev.kind === KIND_MESSAGE && !deleted.has(ev.rumorId))
      .map((ev) => ({
        id: ev.rumorId,
        pubkey: ev.author,
        content: ev.content,
        ms: ev.ms,
      }))
      .sort((a, b) => a.ms - b.ms);
  }, [data]);

  const send = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text) return;
      if (!user?.signer || !community) throw new Error("Sign in to post.");
      const channel = data?.channel;
      if (!channel) throw new Error("This event's channel could not be resolved yet.");

      const rumor = buildRumor({
        kind: KIND_MESSAGE,
        content: text,
        pubkey: user.pubkey,
        ms: Date.now(),
        tags: channelBindingTags(channel.idHex, channel.current.epoch),
      });
      const seal = await sealRumor(rumor, KIND_SEAL_ENCRYPTED, channel.current.group, user.signer);
      await nostr.event(wrapSeal(seal, channel.current.group), {
        signal: AbortSignal.timeout(15_000),
        relays: resolvePrivateRelays(community.relays),
      });
      queryClient.invalidateQueries({ queryKey: ["private-stream", channel.idHex] });
    },
    [user, community, data, nostr, queryClient],
  );

  return { messages, isLoading, send };
}
