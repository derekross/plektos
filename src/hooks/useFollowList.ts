import { useEffect, useState } from "react";
import { useNostr } from "@nostrify/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { getCachedFollowList, cacheFollowList } from "@/lib/indexedDB";
import type { NostrEvent } from "@nostrify/nostrify";

export interface FollowListEvent extends NostrEvent {
  kind: 3;
}

/**
 * Hook for managing NIP-02 Contact Lists (follows)
 * Fetches and manages the user's follow list (kind 3)
 */
export function useFollowList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const [cachedData, setCachedData] = useState<FollowListEvent | null | undefined>(undefined);

  // Load cached follow list on mount (instant)
  useEffect(() => {
    async function loadCache() {
      if (!user?.pubkey) return;

      try {
        const cached = await getCachedFollowList(user.pubkey);
        if (cached) {
          setCachedData(cached.event as FollowListEvent);
        }
      } catch {
        // Cache read failed, continue without cache
      }
    }
    loadCache();
  }, [user?.pubkey]);

  // Fetch the user's follow list
  const {
    data: followList,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["followList", user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return null;

      const events = await nostr.query(
        [
          {
            kinds: [3], // NIP-02 contact list
            authors: [user.pubkey],
            limit: 1,
          },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]) }
      );

      if (events.length === 0) {
        return null;
      }

      // Sort by created_at descending to ensure we get the most recent
      const sortedEvents = events.sort((a, b) => b.created_at - a.created_at);
      const latestEvent = sortedEvents[0] as FollowListEvent;

      // Extract followed pubkeys for caching
      const followedPubkeys = latestEvent.tags
        .filter((tag) => tag[0] === "p")
        .map((tag) => tag[1]);

      // Cache follow list in background (non-blocking)
      cacheFollowList(user.pubkey, latestEvent, followedPubkeys).catch(() => {});

      return latestEvent;
    },
    // Use cached data as placeholder for instant display
    placeholderData: cachedData,
    enabled: !!user?.pubkey,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Get the list of followed pubkeys from the follow list
  const followedPubkeys = followList?.tags
    .filter((tag) => tag[0] === "p")
    .map((tag) => tag[1]) || [];

  // Check if a pubkey is followed
  const isFollowing = (pubkey: string): boolean => {
    return followedPubkeys.includes(pubkey);
  };

  // Fetch the latest follow list from relay to avoid stale-cache overwrites
  const fetchFreshFollowList = async (): Promise<FollowListEvent | null> => {
    if (!user?.pubkey) return null;

    const events = await nostr.query(
      [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
      { signal: AbortSignal.timeout(3000) },
    );

    if (events.length === 0) return null;

    const sorted = events.sort((a, b) => b.created_at - a.created_at);
    return sorted[0] as FollowListEvent;
  };

  // Follow a pubkey
  const followPubkey = async (pubkey: string, relayUrl: string = "") => {
    if (!user) {
      throw new Error("User must be logged in to follow");
    }

    // Always fetch fresh from relay to prevent last-write-wins data loss
    const freshList = await fetchFreshFollowList();
    const currentTags = freshList?.tags || [];

    // Check if already following
    if (currentTags.some(tag => tag[0] === "p" && tag[1] === pubkey)) {
      return; // Already following
    }

    // Add the new followed pubkey
    const newTags = [
      ...currentTags,
      relayUrl ? ["p", pubkey, relayUrl] : ["p", pubkey]
    ];

    // Preserve existing content (usually a JSON string of relay information)
    const content = freshList?.content || "";

    await publishEvent({
      kind: 3,
      content,
      tags: newTags,
    });

    // Invalidate queries to refresh the follow list
    queryClient.invalidateQueries({ queryKey: ["followList", user.pubkey] });
  };

  // Unfollow a pubkey
  const unfollowPubkey = async (pubkey: string) => {
    if (!user) {
      throw new Error("User must be logged in to unfollow");
    }

    // Always fetch fresh from relay to prevent last-write-wins data loss
    const freshList = await fetchFreshFollowList();

    if (!freshList) {
      return; // No follow list exists
    }

    // Remove the pubkey from the follow list
    const newTags = freshList.tags.filter(
      tag => !(tag[0] === "p" && tag[1] === pubkey)
    );

    // Preserve existing content
    const content = freshList.content || "";

    await publishEvent({
      kind: 3,
      content,
      tags: newTags,
    });

    // Invalidate queries to refresh the follow list
    queryClient.invalidateQueries({ queryKey: ["followList", user.pubkey] });
  };

  // Get the relay URL for a specific followed pubkey
  const getFollowRelay = (pubkey: string): string => {
    const followTag = followList?.tags.find(
      tag => tag[0] === "p" && tag[1] === pubkey
    );
    return followTag?.[2] || ""; // Relay URL is in the 3rd element (index 2)
  };

  // Get follow count
  const followCount = followedPubkeys.length;

  return {
    followList,
    followedPubkeys,
    followCount,
    isLoading,
    isFollowing,
    followPubkey,
    unfollowPubkey,
    getFollowRelay,
    refetch,
  };
}
