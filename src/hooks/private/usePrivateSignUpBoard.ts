/**
 * The sign-up board — "who's bringing what".
 *
 * Items are kind-31800 rumors in the event's stream. Claiming does NOT
 * republish the item: it publishes a kind-3302 edit `e`-tagging it, so two
 * people claiming at once produce two edits that resolve by timestamp rather
 * than one silently overwriting the other's whole item.
 *
 * Who may edit what is enforced on read, since any keyholder can publish
 * anything into the stream:
 *   - the item's CREATOR may rename or recategorize it;
 *   - the creator or the CURRENT CLAIMER may change the claim.
 * An edit from anyone else is ignored.
 */
import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { KIND_EDIT, KIND_SEAL_ENCRYPTED } from "@/concord/lib/kinds";
import { buildRumor, channelBindingTags, sealRumor, wrapSeal } from "@/concord/lib/stream";
import type { OpenedEvent } from "@/concord/lib/stream";
import {
  KIND_SIGNUP_ITEM,
  parseSignUpItem,
  serializeSignUpItem,
  type SignUpItem,
} from "@/lib/private/signUpModel";
import { resolvePrivateRelays } from "@/lib/private/relays";
import { usePrivateEvent, usePrivateEventStream } from "./usePrivateEvent";

function editTarget(ev: OpenedEvent): string | undefined {
  return ev.tags.find((t) => t[0] === "e")?.[1];
}

export function usePrivateSignUpBoard(communityIdHex: string | undefined) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { community } = usePrivateEvent(communityIdHex);
  const { data, isLoading } = usePrivateEventStream(communityIdHex);
  const queryClient = useQueryClient();

  const items = useMemo<SignUpItem[]>(() => {
    const opened = data?.opened ?? [];

    const base = new Map<string, SignUpItem>();
    for (const ev of opened) {
      if (ev.kind !== KIND_SIGNUP_ITEM) continue;
      const item = parseSignUpItem(ev.content, ev.rumorId, ev.author, ev.createdAt);
      if (item) base.set(ev.rumorId, item);
    }

    // Field-level merge: newest authorized edit wins per field, so a rename and
    // a claim made independently do not clobber one another.
    const edits = opened
      .filter((ev) => ev.kind === KIND_EDIT && editTarget(ev))
      .sort((a, b) => a.ms - b.ms);

    for (const ev of edits) {
      const target = editTarget(ev)!;
      const item = base.get(target);
      if (!item) continue;
      const patch = parseSignUpItem(ev.content, target, ev.author, ev.createdAt);
      if (!patch) continue;

      const isCreator = ev.author === item.createdBy;
      const isClaimer = Boolean(item.claimedBy) && ev.author === item.claimedBy;

      if (isCreator && patch.name) {
        item.name = patch.name;
        item.category = patch.category;
      }
      if (isCreator || isClaimer || !item.claimedBy) {
        item.claimedBy = patch.claimedBy;
        item.claimedAt = patch.claimedAt;
      }
      if (patch.notes !== undefined) item.notes = patch.notes;
    }

    return [...base.values()].sort((a, b) => a.createdAt - b.createdAt);
  }, [data]);

  const publish = useCallback(
    async (kind: number, content: string, extraTags: string[][] = []) => {
      if (!user?.signer || !community) throw new Error("Sign in first.");
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
      queryClient.invalidateQueries({ queryKey: ["private-stream", community.idHex] });
    },
    [user, community, data, nostr, queryClient],
  );

  const addItem = useCallback(
    (name: string, category: string) =>
      publish(KIND_SIGNUP_ITEM, serializeSignUpItem({ name, category })),
    [publish],
  );

  const setClaim = useCallback(
    (item: SignUpItem, claim: boolean) =>
      publish(
        KIND_EDIT,
        // An empty name marks this as a claim-style edit, so the merge above
        // cannot mistake it for a rename and blank the item's title.
        serializeSignUpItem({
          name: "",
          category: item.category,
          claimedBy: claim ? user?.pubkey : undefined,
          claimedAt: claim ? Date.now() : undefined,
        }),
        [["e", item.id]],
      ),
    [publish, user?.pubkey],
  );

  return { items, isLoading, addItem, setClaim };
}
