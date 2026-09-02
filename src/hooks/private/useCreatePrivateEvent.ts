/**
 * Create a private event.
 *
 * The ordering here is a correctness constraint, not a UX preference.
 *
 * Naively this costs eight signer round-trips, which on a bunker is ten to
 * fifteen seconds of spinner. Worse, the obvious order is wrong: publish the
 * event first and a failed key write leaves a host who has published an event
 * whose keys they no longer hold — unrecoverable. So:
 *
 *   BLOCKING (3 signer calls)
 *     1. encrypt the key list      keys are persisted FIRST
 *     2. sign the key list
 *     3. sign the calendar seal    the event now exists
 *     -> navigate
 *
 *   BACKGROUND (2 signer calls, retryable)
 *     4. metadata edition (vsk 0)
 *     5. channel edition  (vsk 2)
 *
 * The background half is deliberately not blocking: a private channel whose key
 * rides in the join material renders in Armada even with an empty control
 * plane, so a failed edition degrades the event (no name/description/relay set
 * in other clients) rather than breaking it.
 */
import { useMutation } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { addToList, toJoinMaterial } from "@/concord/lib/communityList";
import { sealEdition } from "@/concord/lib/control";
import { KIND_SEAL_ENCRYPTED } from "@/concord/lib/kinds";
import { sealRumor, wrapSeal } from "@/concord/lib/stream";
import type { CalendarEventInput } from "@/lib/private/calendar";
import {
  buildEventRumor,
  genesisEditions,
  mintPrivateEvent,
  type MintedPrivateEvent,
} from "@/lib/private/create";
import { PRIVATE_EVENT_RELAYS } from "@/lib/private/relays";
import { usePublishPrivateEventKeys } from "./usePrivateEventKeys";

export interface CreatePrivateEventInput {
  calendar: CalendarEventInput;
  description?: string;
}

export interface CreatedPrivateEvent {
  communityIdHex: string;
  minted: MintedPrivateEvent;
  rumorId: string;
}

export function useCreatePrivateEvent() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const publishKeys = usePublishPrivateEventKeys();

  return useMutation<CreatedPrivateEvent, Error, CreatePrivateEventInput>({
    mutationFn: async ({ calendar, description }) => {
      if (!user?.signer.nip44) {
        throw new Error(
          "Your signer can't encrypt yet (NIP-44 required). Try a different login, " +
            "or make this a public party.",
        );
      }

      const relays = [...PRIVATE_EVENT_RELAYS];
      const minted = mintPrivateEvent(calendar.title, user.pubkey, relays);

      // 1-2. Keys first. If this fails we have published nothing.
      await publishKeys.mutateAsync((prev) =>
        addToList(prev, {
          community_id: minted.community.idHex,
          seed: toJoinMaterial(minted.community),
          current: toJoinMaterial(minted.community),
          added_at: Date.now(),
        }),
      );

      // 3. The event itself.
      const rumor = buildEventRumor(minted, calendar, user.pubkey);
      const seal = await sealRumor(rumor, KIND_SEAL_ENCRYPTED, minted.stream, user.signer);
      await nostr.event(wrapSeal(seal, minted.stream), {
        signal: AbortSignal.timeout(15_000),
        relays,
      });

      // 4-5. Control plane, off the critical path. A failure here degrades the
      // event in other clients; it does not break it.
      void (async () => {
        try {
          const editions = genesisEditions(
            minted,
            { name: calendar.title, description, relays },
            user.pubkey,
          );
          for (const rumorToSeal of [editions.metadata, editions.channel]) {
            const wrap = await sealEdition(rumorToSeal, minted.controlWrite, user.signer);
            await nostr.event(wrap, { signal: AbortSignal.timeout(15_000), relays });
          }
        } catch (err) {
          console.error("private event: control-plane genesis failed", err);
        }
      })();

      return {
        communityIdHex: minted.community.idHex,
        minted,
        rumorId: rumor.id,
      };
    },
  });
}
