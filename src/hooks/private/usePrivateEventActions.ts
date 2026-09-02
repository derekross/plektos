/**
 * Host and guest actions on a private event: edit, delete, leave.
 *
 * Editing republishes the calendar rumor under the SAME `d`. That mints a new
 * rumor id, and every existing RSVP `e`-tags the old one — which is exactly
 * what the re-pointing table in usePrivateEventCalendar exists to survive. This
 * is the first thing that actually exercises it.
 *
 * Deleting is honest about what Concord can and cannot do. A kind-5 tombstone
 * hides the event in every client that reads the stream, and dropping the
 * channel key removes the party from the actor's own list. It does NOT revoke
 * anything: every guest still holds the channel key, and the wraps stay on
 * relays. Revocation needs a CORD-06 rekey, which this app does not implement.
 */
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { bytesToHex } from "@/concord/lib/derive";
import { KIND_DELETE, KIND_SEAL_ENCRYPTED } from "@/concord/lib/kinds";
import { buildRumor, channelBindingTags, sealRumor, wrapSeal } from "@/concord/lib/stream";
import type { CommunityList } from "@/concord/lib/communityList";
import {
  buildCalendarTags,
  type CalendarEvent,
  type CalendarEventInput,
} from "@/lib/private/calendar";
import { resolvePrivateRelays } from "@/lib/private/relays";
import { usePrivateParty, usePrivateEventStream } from "./usePrivateEvent";
import { usePublishPrivateEventKeys } from "./usePrivateEventKeys";

/**
 * Remove one channel from a membership.
 *
 * Two steps, and BOTH are needed.
 *
 * Dropping it from `channels` alone would not stick: the merge algebra UNIONS
 * channel keys, so any other copy of the list — another device, a stale relay —
 * hands it straight back. `channel_cuts` is the intended mechanism for that: a
 * per-channel epoch floor that takes the MAX on merge, so it is monotonic.
 *
 * But recording a cut alone does not stick either, which a test caught. Cuts
 * are applied by `mergeEntry`, NOT by `rehydrateCommunity`, so a list that is
 * written and read back without an intervening merge still carries the channel.
 * So the cut is recorded (durable against a stale copy) *and* applied here
 * (effective immediately).
 */
export function dropChannel(
  list: CommunityList,
  communityId: string,
  channelIdHex: string,
  epoch: number,
): CommunityList {
  return {
    ...list,
    entries: list.entries.map((entry) =>
      entry.community_id !== communityId
        ? entry
        : {
            ...entry,
            channel_cuts: [
              ...(entry.channel_cuts ?? []).filter(
                (c) => c.id.toLowerCase() !== channelIdHex.toLowerCase(),
              ),
              // Floor ABOVE the held epoch, so the key at that epoch is cut.
              { id: channelIdHex.toLowerCase(), epoch: epoch + 1 },
            ],
            current: {
              ...entry.current,
              channels: (entry.current.channels ?? []).filter(
                (c) => c.id.toLowerCase() !== channelIdHex.toLowerCase(),
              ),
            },
          },
    ),
  };
}

export function usePrivateEventActions(channelIdHex: string | undefined) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { community, isHost } = usePrivateParty(channelIdHex);
  const { data } = usePrivateEventStream(channelIdHex);
  const publishKeys = usePublishPrivateEventKeys();
  const queryClient = useQueryClient();

  const publishRumor = useCallback(
    async (kind: number, content: string, extraTags: string[][]) => {
      if (!user?.signer || !community) throw new Error("Sign in first.");
      const channel = data?.channel;
      if (!channel) throw new Error("This party's channel could not be resolved yet.");

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
      return rumor.id;
    },
    [user, community, data, nostr, queryClient],
  );

  /**
   * Republish the event with the same `d`.
   *
   * The identifier MUST be carried over — a fresh one would fork a second
   * event rather than edit this one, leaving both in the fold.
   */
  const editEvent = useCallback(
    (event: CalendarEvent, patch: Omit<CalendarEventInput, "identifier" | "kind">) =>
      publishRumor(
        event.kind,
        patch.description ?? "",
        buildCalendarTags({ ...patch, identifier: event.identifier, kind: event.kind }),
      ),
    [publishRumor],
  );

  /**
   * Drop the party from this user's key list.
   *
   * For a guest this is "leave"; for a host it is the second half of a delete.
   * Either way the key is gone from their list and the party stops appearing —
   * it does not reach anyone else's copy.
   */
  const leaveParty = useCallback(async () => {
    if (!community || !channelIdHex) throw new Error("This party isn't in your list.");
    const held = community.privateChannels.find((c) => bytesToHex(c.id) === channelIdHex);
    const epoch = Number(held?.epoch ?? 0n);
    await publishKeys.mutateAsync((prev) =>
      dropChannel(prev, community.idHex, channelIdHex, epoch),
    );
  }, [community, channelIdHex, publishKeys]);

  /** Tombstone the event and drop the party from the actor's own list. */
  const deleteEvent = useCallback(
    async (event: CalendarEvent) => {
      if (!isHost) throw new Error("Only the host can delete this party.");
      await publishRumor(KIND_DELETE, "", [["e", event.rumorId]]);
      await leaveParty();
    },
    [isHost, publishRumor, leaveParty],
  );

  return { editEvent, deleteEvent, leaveParty, isHost };
}
