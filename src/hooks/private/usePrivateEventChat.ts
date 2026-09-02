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
import { KIND_DELETE, KIND_MESSAGE, KIND_REACTION, KIND_SEAL_ENCRYPTED } from "@/concord/lib/kinds";
import { buildRumor, channelBindingTags, sealRumor, wrapSeal } from "@/concord/lib/stream";
import { resolvePrivateRelays } from "@/lib/private/relays";
import { usePrivateParty, usePrivateEventStream } from "./usePrivateEvent";

export interface PrivateReaction {
  emoji: string;
  count: number;
  /** The viewer's own reaction rumor id, when they have reacted with this. */
  mine?: string;
}

export interface QuotedMessage {
  id: string;
  pubkey: string;
  content: string;
}

export interface PrivateMessage {
  id: string;
  pubkey: string;
  content: string;
  ms: number;
  /** NIP-C7 inline quote (CORD-03 §2.1): stays a kind 9, cites a rumor id. */
  quote?: QuotedMessage;
  reactions: PrivateReaction[];
}

export function usePrivateEventChat(channelIdHex: string | undefined) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const selfPubkey = user?.pubkey;
  const { community } = usePrivateParty(channelIdHex);
  const { data, isLoading } = usePrivateEventStream(channelIdHex);
  const queryClient = useQueryClient();

  const messages = useMemo<PrivateMessage[]>(() => {
    const opened = data?.opened ?? [];

    // Deletes are already applied centrally by usePrivateEventStream.
    const byId = new Map(
      opened.filter((ev) => ev.kind === KIND_MESSAGE).map((ev) => [ev.rumorId, ev]),
    );

    // Kind 7, one per (author, emoji, target). A second reaction from the same
    // author with the same emoji is the same fact restated, not two votes.
    const reactions = new Map<string, Map<string, Map<string, string>>>();
    for (const ev of opened) {
      if (ev.kind !== KIND_REACTION) continue;
      const target = ev.tags.find((t) => t[0] === "e")?.[1];
      const emoji = ev.content.trim();
      if (!target || !emoji) continue;
      const forTarget = reactions.get(target) ?? new Map<string, Map<string, string>>();
      const forEmoji = forTarget.get(emoji) ?? new Map<string, string>();
      forEmoji.set(ev.author, ev.rumorId);
      forTarget.set(emoji, forEmoji);
      reactions.set(target, forTarget);
    }

    return [...byId.values()]
      .map((ev) => {
        // The `q` tag cites the quoted message's RUMOR id, never the outer
        // wrap's — a wrap id differs per re-wrap and would dangle.
        const q = ev.tags.find((t) => t[0] === "q")?.[1];
        const quoted = q ? byId.get(q) : undefined;
        const mine = (byAuthor: Map<string, string>) =>
          selfPubkey ? byAuthor.get(selfPubkey) : undefined;

        return {
          id: ev.rumorId,
          pubkey: ev.author,
          content: ev.content,
          ms: ev.ms,
          quote: quoted
            ? { id: quoted.rumorId, pubkey: quoted.author, content: quoted.content }
            : undefined,
          reactions: [...(reactions.get(ev.rumorId)?.entries() ?? [])]
            .map(([emoji, byAuthor]) => ({
              emoji,
              count: byAuthor.size,
              mine: mine(byAuthor),
            }))
            .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji)),
        };
      })
      .sort((a, b) => a.ms - b.ms);
  }, [data, selfPubkey]);

  const publish = useCallback(
    async (kind: number, content: string, extraTags: string[][] = []) => {
      if (!user?.signer || !community) throw new Error("Sign in to post.");
      const channel = data?.channel;
      if (!channel) throw new Error("This event's channel could not be resolved yet.");

      const rumor = buildRumor({
        kind,
        content,
        pubkey: user.pubkey,
        ms: Date.now(),
        tags: [...channelBindingTags(channel.idHex, channel.current.epoch), ...extraTags],
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

  /**
   * Send a message, optionally quoting another inline.
   *
   * CORD-03 §2.1: an inline quote stays a kind 9 with a `q` tag — it is NOT a
   * kind 1111 threaded reply, which is a separate action that renders in a
   * thread off its root. Reusing `q` for that would conflate the two.
   */
  const send = useCallback(
    (content: string, quoting?: PrivateMessage) => {
      const text = content.trim();
      if (!text) return Promise.resolve();
      return publish(
        KIND_MESSAGE,
        text,
        quoting ? [["q", quoting.id, "", quoting.pubkey]] : [],
      );
    },
    [publish],
  );

  /**
   * Toggle one emoji on one message.
   *
   * Un-reacting is a kind-5 delete of the viewer's OWN reaction rumor, which
   * the central delete filter accepts precisely because the author matches.
   */
  const toggleReaction = useCallback(
    (message: PrivateMessage, emoji: string) => {
      const existing = message.reactions.find((r) => r.emoji === emoji)?.mine;
      if (existing) return publish(KIND_DELETE, "", [["e", existing]]);
      return publish(KIND_REACTION, emoji, [
        ["e", message.id],
        ["p", message.pubkey],
        // Names the kind of the thing reacted to, per CORD-03 §2.3.
        ["k", String(KIND_MESSAGE)],
      ]);
    },
    [publish],
  );

  return { messages, isLoading, send, toggleReaction };
}
