/**
 * The private event itself, its RSVP roster, and the RSVP mutation.
 *
 * The subtle part is re-pointing. Rumors have no `a` coordinate, so an RSVP
 * `e`-tags the calendar rumor's id — but editing republishes under the same
 * `d`, which mints a NEW rumor id, and every existing vote would orphan. So
 * map each calendar rumor id to its addressable coordinate, and each
 * coordinate to whichever rumor currently holds it, then move the votes
 * forward.
 *
 * This matters more in Plektos than in the app it came from, because Plektos
 * has a real edit flow that hosts actually use.
 */
import { useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  KIND_CALENDAR_DATE,
  KIND_CALENDAR_RSVP,
  KIND_CALENDAR_TIME,
  KIND_SEAL_ENCRYPTED,
} from "@/concord/lib/kinds";
import { buildRumor, channelBindingTags, sealRumor, wrapSeal } from "@/concord/lib/stream";
import {
  foldCalendarRumors,
  parseCalendarRumor,
  parseRsvpRumor,
  tallyRsvps,
  type CalendarEvent,
  type RsvpStatus,
  type RsvpTally,
  type RsvpVote,
} from "@/lib/private/calendar";
import { resolvePrivateRelays } from "@/lib/private/relays";
import { usePrivateEvent, usePrivateEventStream } from "./usePrivateEvent";

/** How long an unconfirmed RSVP survives refetches. Wider than a chat message's
 * because the RSVP chips have no "sending…" affordance to explain a revert. */
const PENDING_TTL_MS = 3 * 60_000;

export interface PrivateEventDetail {
  event?: CalendarEvent;
  tally: RsvpTally;
  isLoading: boolean;
}

export function usePrivateEventCalendar(communityIdHex: string | undefined) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { community, isHost } = usePrivateEvent(communityIdHex);
  const { data, isLoading } = usePrivateEventStream(communityIdHex);
  const queryClient = useQueryClient();

  /** The viewer's unconfirmed votes: rumorId -> { vote, expires }. */
  const pending = useRef(new Map<string, { vote: RsvpVote; expires: number }>());

  const detail = useMemo<PrivateEventDetail>(() => {
    const opened = data?.opened ?? [];
    const events = foldCalendarRumors(opened);
    const event = events[0];

    // Rumor id -> coordinate, and coordinate -> the rumor id that currently
    // holds it. Votes aimed at a superseded edit move forward.
    const coordByRumorId = new Map<string, string>();
    for (const ev of opened) {
      if (ev.kind !== KIND_CALENDAR_DATE && ev.kind !== KIND_CALENDAR_TIME) continue;
      const parsed = parseCalendarRumor(ev);
      if (parsed) {
        coordByRumorId.set(parsed.rumorId, `${parsed.kind}:${parsed.author}:${parsed.identifier}`);
      }
    }
    const currentByCoord = new Map<string, string>();
    for (const e of events) {
      currentByCoord.set(`${e.kind}:${e.author}:${e.identifier}`, e.rumorId);
    }

    const votesByEvent = new Map<string, RsvpVote[]>();
    for (const ev of opened) {
      if (ev.kind !== KIND_CALENDAR_RSVP) continue;
      const parsed = parseRsvpRumor(ev);
      if (!parsed) continue;
      const coord = coordByRumorId.get(parsed.target);
      const target = coord ? (currentByCoord.get(coord) ?? parsed.target) : parsed.target;
      const list = votesByEvent.get(target) ?? [];
      list.push(parsed.vote);
      votesByEvent.set(target, list);
    }

    // Re-apply the viewer's unconfirmed votes, dropping any that a relay copy
    // has now confirmed.
    const now = Date.now();
    for (const [target, op] of pending.current) {
      if (op.expires <= now) {
        pending.current.delete(target);
        continue;
      }
      const list = votesByEvent.get(target) ?? [];
      const confirmed = list.some(
        (v) => v.pubkey === op.vote.pubkey && v.status === op.vote.status,
      );
      if (confirmed) {
        pending.current.delete(target);
      } else {
        votesByEvent.set(target, [...list.filter((v) => v.pubkey !== op.vote.pubkey), op.vote]);
      }
    }

    const tally = tallyRsvps(event ? (votesByEvent.get(event.rumorId) ?? []) : [], user?.pubkey);
    return { event, tally, isLoading };
  }, [data, isLoading, user?.pubkey]);

  const setRsvp = useCallback(
    async (event: CalendarEvent, status: RsvpStatus, guests = 0) => {
      if (!user?.signer || !community) throw new Error("Sign in to RSVP.");

      // Optimistic: the rumor id is known before publishing, so the relay copy
      // dedupes against the pending entry rather than replacing it.
      pending.current.set(event.rumorId, {
        vote: { pubkey: user.pubkey, status, ms: Date.now(), guests },
        expires: Date.now() + PENDING_TTL_MS,
      });

      const channel = data?.channel;
      if (!channel) throw new Error("This event's channel could not be resolved yet.");

      const rumor = buildRumor({
        kind: KIND_CALENDAR_RSVP,
        content: "",
        pubkey: user.pubkey,
        ms: Date.now(),
        tags: [
          ...channelBindingTags(channel.idHex, channel.current.epoch),
          ["e", event.rumorId],
          ["status", status],
          ["k", String(event.kind)],
          ["p", event.author],
          ...(guests > 0 ? [["guests", String(guests)]] : []),
        ],
      });
      const seal = await sealRumor(rumor, KIND_SEAL_ENCRYPTED, channel.current.group, user.signer);
      await nostr.event(wrapSeal(seal, channel.current.group), {
        signal: AbortSignal.timeout(15_000),
        relays: resolvePrivateRelays(community.relays),
      });
      queryClient.invalidateQueries({ queryKey: ["private-stream", community.idHex] });
    },
    [user, community, nostr, queryClient, data],
  );

  return { ...detail, setRsvp, isHost, community };
}
