/**
 * Minting and redeeming private-event invites.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { addToList } from "@/concord/lib/communityList";
import { KIND_INVITE_BUNDLE } from "@/concord/lib/kinds";
import { parseBundleEvent, parseInviteLink, type ParsedInviteLink } from "@/concord/lib/invite";
import type { Community } from "@/concord/lib/types";
import { bundleToJoinMaterial, mintInvite } from "@/lib/private/invite";
import { PRIVATE_EVENT_RELAYS, resolvePrivateRelays } from "@/lib/private/relays";
import { usePublishPrivateEventKeys } from "./usePrivateEventKeys";

/** Publish a fresh invite link for an event the viewer hosts. */
export function useMintInvite() {
  const { nostr } = useNostr();

  return useMutation({
    mutationFn: async ({
      community,
      channelIdHex,
      description,
    }: {
      community: Community;
      channelIdHex: string;
      description?: string;
    }) => {
      const { event, url } = mintInvite(community, channelIdHex, window.location.origin, {
        description,
      });
      // The bundle is signed by the single-use link keypair, so this costs the
      // host zero signer round-trips.
      await nostr.event(event, {
        signal: AbortSignal.timeout(15_000),
        relays: resolvePrivateRelays(community.relays),
      });
      return url;
    },
  });
}

/**
 * Resolve an invite link to its bundle.
 *
 * Queried against the union of the link's own bootstrap relays and the app
 * set: a link minted elsewhere names relays we may not carry, and without the
 * union most real invites would simply report "not found". The token stays out
 * of the query key so it never lands in devtools or a cache dump.
 */
export function useInviteBundle(link: ParsedInviteLink | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ["invite-bundle", link?.linkSigner ?? ""],
    queryFn: async (c) => {
      if (!link) return undefined;
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(12_000)]);
      const relays = [...new Set([...link.bootstrapRelays, ...PRIVATE_EVENT_RELAYS])];
      const events = await nostr.query(
        [{ kinds: [KIND_INVITE_BUNDLE], authors: [link.linkSigner], limit: 5 }],
        { signal, relays },
      );
      const newest = events.sort((a, b) => b.created_at - a.created_at)[0];
      if (!newest) return undefined;
      // Re-verifies the self-certifying community_id against (owner, salt), so
      // even a compromised link creator cannot smuggle a false owner.
      return parseBundleEvent(newest, link.linkSigner, link.token, Date.now());
    },
    enabled: Boolean(link),
    retry: false,
    staleTime: 60_000,
  });
}

/** Accept an invite: store its keys in the user's encrypted key list. */
export function useRedeemInvite() {
  const publishKeys = usePublishPrivateEventKeys();
  const { user } = useCurrentUser();

  return useMutation({
    mutationFn: async (bundle: Parameters<typeof bundleToJoinMaterial>[0]) => {
      if (!user) throw new Error("Sign in to accept this invite.");
      const jm = bundleToJoinMaterial(bundle);
      await publishKeys.mutateAsync((prev) =>
        addToList(prev, {
          community_id: jm.community_id,
          seed: jm,
          current: jm,
          added_at: Date.now(),
        }),
      );
      // A party is addressed by its channel, and the bundle carries exactly one.
      return jm.channels[0]?.id;
    },
  });
}

/** Parse a pasted or routed invite link. Returns undefined when it isn't one. */
export function parseInvite(input: string): ParsedInviteLink | undefined {
  return parseInviteLink(input);
}
