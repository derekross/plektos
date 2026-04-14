import { useNostr } from "@nostrify/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import type { NostrEvent } from "@nostrify/nostrify";

export interface MuteListEvent extends NostrEvent {
  kind: 10000;
}

/**
 * Hook for managing NIP-51 mute lists
 * Fetches and manages the user's mute list (kind 10000)
 */
export function useMuteList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  // Fetch the user's mute list
  const {
    data: muteList,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["muteList", user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return null;

      const events = await nostr.query(
        [
          {
            kinds: [10000], // NIP-51 mute list
            authors: [user.pubkey],
            limit: 10, // Get more events to ensure we have the latest
          },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]) }
      );
      
      if (events.length === 0) {
        return null;
      }
      
      // Sort by created_at descending to ensure we get the most recent
      const sortedEvents = events.sort((a, b) => b.created_at - a.created_at);
      const latestEvent = sortedEvents[0] as MuteListEvent;
      
      return latestEvent;
    },
    enabled: !!user?.pubkey,
    staleTime: 30000, // Consider data stale after 30 seconds
  });

  // Get the list of muted pubkeys from the mute list
  const mutedPubkeys = muteList?.tags
    .filter((tag) => tag[0] === "p")
    .map((tag) => tag[1]) || [];

  // Check if a pubkey is muted
  const isMuted = (pubkey: string): boolean => {
    return mutedPubkeys.includes(pubkey);
  };

  // Fetch the latest mute list from relay to avoid stale-cache overwrites
  const fetchFreshMuteList = async (): Promise<MuteListEvent | null> => {
    if (!user?.pubkey) return null;

    const events = await nostr.query(
      [{ kinds: [10000], authors: [user.pubkey], limit: 1 }],
      { signal: AbortSignal.timeout(3000) },
    );

    if (events.length === 0) return null;

    const sorted = events.sort((a, b) => b.created_at - a.created_at);
    return sorted[0] as MuteListEvent;
  };

  // Add a pubkey to the mute list
  const mutePubkey = async (pubkey: string, reason: string = "") => {
    if (!user) {
      throw new Error("User must be logged in to mute");
    }

    // Always fetch fresh from relay to prevent last-write-wins data loss
    const freshList = await fetchFreshMuteList();
    const currentTags = freshList?.tags || [];

    // Check if already muted
    if (currentTags.some(tag => tag[0] === "p" && tag[1] === pubkey)) {
      return; // Already muted
    }

    // Add the new muted pubkey
    const newTags = [
      ...currentTags,
      reason ? ["p", pubkey, "", reason] : ["p", pubkey]
    ];

    await publishEvent({
      kind: 10000,
      content: "",
      tags: newTags,
    });

    // Invalidate queries to refresh the mute list
    queryClient.invalidateQueries({ queryKey: ["muteList", user.pubkey] });
  };

  // Remove a pubkey from the mute list
  const unmutePubkey = async (pubkey: string) => {
    if (!user) {
      throw new Error("User must be logged in to unmute");
    }

    // Always fetch fresh from relay to prevent last-write-wins data loss
    const freshList = await fetchFreshMuteList();

    if (!freshList) {
      return; // No mute list exists
    }

    // Remove the pubkey from the mute list
    const newTags = freshList.tags.filter(
      tag => !(tag[0] === "p" && tag[1] === pubkey)
    );

    await publishEvent({
      kind: 10000,
      content: "",
      tags: newTags,
    });

    // Invalidate queries to refresh the mute list
    queryClient.invalidateQueries({ queryKey: ["muteList", user.pubkey] });
  };

  // Get the mute reason for a specific pubkey
  const getMuteReason = (pubkey: string): string => {
    const muteTag = muteList?.tags.find(
      tag => tag[0] === "p" && tag[1] === pubkey
    );
    return muteTag?.[3] || ""; // Reason is in the 4th element (index 3)
  };

  return {
    muteList,
    mutedPubkeys,
    isLoading,
    isMuted,
    mutePubkey,
    unmutePubkey,
    getMuteReason,
    refetch,
  };
}