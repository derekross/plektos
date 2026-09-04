/**
 * Minting and redeeming private-event invites.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { addToList } from "@/concord/lib/communityList";
import { KIND_INVITE_BUNDLE } from "@/concord/lib/kinds";
import {
  buildRevocationEvent,
  parseBundleEvent,
  parseInviteLink,
  type InviteListEntry,
  type ParsedInviteLink,
} from "@/concord/lib/invite";
import { hexToBytes } from "@/concord/lib/derive";
import { addInvite, defaultExpiry, revokeInvite } from "@/lib/private/inviteList";
import type { Community } from "@/concord/lib/types";
import { bundleToJoinMaterial, mintInvite } from "@/lib/private/invite";
import { PRIVATE_EVENT_RELAYS, resolvePrivateRelays } from "@/lib/private/relays";
import { usePrivateParties } from "./usePrivateEvent";
import { usePublishPrivateEventKeys } from "./usePrivateEventKeys";
import { usePublishInviteList } from "./useInviteList";

/**
 * Publish a fresh invite link for an event the viewer hosts.
 *
 * Two things happen that did not before: the link is given an expiry, and it
 * is recorded in the host's Invite List so it can be shown again and revoked.
 * The record is written AFTER the bundle is published — a recorded link that
 * does not exist would show the host a link nobody can use, which is worse
 * than an unrecorded one they can simply mint again.
 */
export function useMintInvite() {
  const { nostr } = useNostr();
  const { parties } = usePrivateParties();
  const publishInvites = usePublishInviteList();

  return useMutation({
    mutationFn: async ({
      community,
      channelIdHex,
      description,
      eventEndsMs,
      neverExpires,
    }: {
      community: Community;
      channelIdHex: string;
      description?: string;
      /** End of the party, so the link outlives it rather than the mint date. */
      eventEndsMs?: number;
      neverExpires?: boolean;
    }) => {
      const now = Date.now();
      // MILLISECONDS here: `parseBundleEvent` compares `expires_at` against
      // Date.now(). The Invite List stores seconds. See inviteList.ts.
      const expiresAtMs = neverExpires ? undefined : defaultExpiry(eventEndsMs, now);

      const minted = mintInvite(community, channelIdHex, window.location.origin, {
        description,
        ...(expiresAtMs ? { expiresAt: expiresAtMs } : {}),
        // Passed along so a guest's first open is one lookup by id rather than
        // a walk back through the party's whole history. Absent for a party
        // created before anchors existed, which costs the guest nothing but a
        // slower first load.
        anchor: parties.find((p) => p.channelIdHex === channelIdHex)?.anchor,
      });

      // The bundle is signed by the single-use link keypair, so this costs the
      // host zero signer round-trips.
      await nostr.event(minted.event, {
        signal: AbortSignal.timeout(15_000),
        relays: resolvePrivateRelays(community.relays),
      });

      await publishInvites.mutateAsync((prev) =>
        addInvite(
          prev,
          {
            token: minted.token,
            signerSk: minted.signerSk,
            communityId: community.idHex,
            channelIdHex,
            url: minted.url,
            expiresAtMs,
          },
          now,
        ),
      );

      return minted.url;
    },
  });
}

/**
 * Turn off a link.
 *
 * Re-posts the link's coordinate as a CORD-05 tombstone, which every client
 * reading the bundle refuses. That is the whole of it, and the UI must not
 * imply more: anyone who already redeemed this link holds the channel key and
 * keeps it. Revocation stops new joins; it does not remove a guest.
 *
 * The revocation is published BEFORE the local record is tombstoned, so a
 * failure leaves the host still able to see and retry the link rather than
 * believing they turned off something that is still live.
 */
export function useRevokeInvite() {
  const { nostr } = useNostr();
  const publishInvites = usePublishInviteList();

  return useMutation({
    mutationFn: async ({
      entry,
      community,
    }: {
      entry: InviteListEntry;
      community: Community;
    }) => {
      await nostr.event(buildRevocationEvent(hexToBytes(entry.signer_sk)), {
        signal: AbortSignal.timeout(15_000),
        relays: resolvePrivateRelays(community.relays),
      });
      await publishInvites.mutateAsync((prev) =>
        revokeInvite(prev, entry.token, entry.community_id),
      );
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
