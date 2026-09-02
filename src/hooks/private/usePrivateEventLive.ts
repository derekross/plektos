/**
 * Live updates for a private event.
 *
 * Without this the stream is poll-only, which is wrong for the thing a party
 * page is for: an RSVP or a message from someone standing next to you should
 * not need a refresh.
 *
 * New wraps are opened and pushed straight into the stream query's cache
 * rather than triggering a refetch. Invalidating instead would be simpler, but
 * a busy thread would then re-download and re-decrypt the entire history on
 * every incoming message. `openEventWraps` memoizes by wrap id, so the wrap
 * that arrives here is opened exactly once and the later reconciliation poll
 * finds it already decoded.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrEvent } from "@nostrify/nostrify";

import { KIND_WRAP } from "@/concord/lib/kinds";
import { openEventWraps } from "@/lib/private/stream";
import { resolvePrivateRelays } from "@/lib/private/relays";
import { usePrivateParty, usePrivateEventStream, type PrivateStreamState } from "./usePrivateEvent";

export function usePrivateEventLive(channelIdHex: string | undefined) {
  const { nostr } = useNostr();
  const { community } = usePrivateParty(channelIdHex);
  const { data } = usePrivateEventStream(channelIdHex);
  const queryClient = useQueryClient();

  const channel = data?.channel;

  /**
   * Resubscribe only when the set of stream addresses genuinely changes.
   * Depending on `channel` itself would tear down and rebuild the
   * subscription on every refetch, because `channelsView` returns fresh
   * objects each time.
   */
  const streamSig = channel?.streams.map((s) => s.group.pk).join(",") ?? "";
  const relaySig = community?.relays.join(",") ?? "";

  useEffect(() => {
    if (!channel || !community || !channelIdHex) return;

    const controller = new AbortController();
    const streams = channel.streams.map((s) => ({
      stream: s.group,
      channelIdHex: channel.idHex,
      epoch: s.epoch,
    }));
    const authors = streams.map((s) => s.stream.pk);

    (async () => {
      try {
        for await (const msg of nostr.req(
          [
            {
              kinds: [KIND_WRAP],
              authors,
              // A small backstop rather than 0: relays differ on how they
              // treat `since`, and a few seconds of overlap with the initial
              // fetch is free — duplicates are dropped by rumor id below.
              since: Math.floor(Date.now() / 1000) - 5,
            },
          ],
          { signal: controller.signal, relays: resolvePrivateRelays(community.relays) },
        )) {
          if (msg[0] !== "EVENT") continue;

          const opened = openEventWraps([msg[2] as NostrEvent], streams);
          if (opened.length === 0) continue;

          queryClient.setQueryData<PrivateStreamState>(
            ["private-stream", channelIdHex],
            (prev) => {
              // Nothing cached yet means the initial fetch is still in flight;
              // it will pick this wrap up itself. Seeding a partial cache here
              // would render an event with no history behind it.
              if (!prev) return prev;
              const seen = new Set(prev.opened.map((o) => o.rumorId));
              const fresh = opened.filter((o) => !seen.has(o.rumorId));
              return fresh.length === 0 ? prev : { ...prev, opened: [...prev.opened, ...fresh] };
            },
          );
        }
      } catch {
        // Aborted on unmount, or the relay closed the subscription. The
        // reconciliation poll in usePrivateEventStream is the safety net.
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamSig, relaySig, channelIdHex, nostr, queryClient]);
}
