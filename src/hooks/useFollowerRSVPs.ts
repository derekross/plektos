import { useNostr } from "@nostrify/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFollowList } from "@/hooks/useFollowList";
import { useMemo, useRef } from "react";
import type { EventRSVP, DateBasedEvent, TimeBasedEvent, LiveEvent, RoomMeeting, InteractiveRoom } from "@/lib/eventTypes";

export interface FollowerRSVPActivity {
  rsvp: EventRSVP;
  event: DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom;
  authorPubkey: string;
}

const ITEMS_PER_PAGE = 20;

/**
 * Hook to fetch RSVPs from followed users that are marked as "accepted" (attending)
 * This creates a social feed of events that people you follow are attending
 * Supports infinite scroll pagination
 */
export function useFollowerRSVPs() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { followedPubkeys, isLoading: isLoadingFollows } = useFollowList();

  // Create a stable query key string to prevent refetches on reference changes
  const followedKeyString = useMemo(
    () => [...followedPubkeys].sort().join(","),
    [followedPubkeys]
  );

  // Keep a stable reference to the pubkeys array for the query function
  const followedPubkeysRef = useRef(followedPubkeys);
  followedPubkeysRef.current = followedPubkeys;

  const {
    data,
    isLoading: isLoadingRSVPs,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["followerRSVPs", followedKeyString],
    queryFn: async ({ pageParam, signal }) => {
      const pubkeys = followedPubkeysRef.current;
      if (!user?.pubkey || !pubkeys.length) return { activities: [], nextCursor: null };

      const until = pageParam as number | undefined;

      // Step 1: Fetch RSVPs from followed users
      const rsvpFilter: {
        kinds: number[];
        authors: string[];
        limit: number;
        until?: number;
      } = {
        kinds: [31925], // RSVP events
        authors: pubkeys,
        limit: ITEMS_PER_PAGE * 2, // Get more RSVPs to account for filtering
      };

      // Add until parameter for pagination
      if (until) {
        rsvpFilter.until = until;
      }

      const rsvpEvents = await nostr.query(
        [rsvpFilter],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) }
      );

      // Step 2: Filter for only "accepted" RSVPs (people actually attending)
      const acceptedRSVPs = (rsvpEvents as unknown as EventRSVP[]).filter(rsvp => {
        const status = rsvp.tags.find(tag => tag[0] === "status")?.[1];
        return status === "accepted";
      });

      if (acceptedRSVPs.length === 0) return { activities: [], nextCursor: null };

      // Step 3: Get the event IDs from the RSVPs
      const eventIds = acceptedRSVPs
        .map(rsvp => rsvp.tags.find(tag => tag[0] === "e")?.[1])
        .filter((id): id is string => id !== undefined);

      if (eventIds.length === 0) return { activities: [], nextCursor: null };

      // Step 4: Fetch the actual events
      const events = await nostr.query(
        [
          {
            kinds: [31922, 31923, 30311, 30312, 30313], // All calendar event types including NIP-53
            ids: eventIds,
          },
        ],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) }
      );

      // Step 5: Combine RSVPs with their corresponding events
      const activities: FollowerRSVPActivity[] = [];
      
      for (const rsvp of acceptedRSVPs) {
        const eventId = rsvp.tags.find(tag => tag[0] === "e")?.[1];
        if (!eventId) continue;

        const event = events.find(e => e.id === eventId) as 
          DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom | undefined;
        
        if (!event) continue;

        activities.push({
          rsvp,
          event,
          authorPubkey: rsvp.pubkey,
        });
      }

      // Step 6: Sort by RSVP creation time (most recent first)
      const sortedActivities = activities.sort((a, b) => b.rsvp.created_at - a.rsvp.created_at);
      
      // Take only the requested page size
      const pageActivities = sortedActivities.slice(0, ITEMS_PER_PAGE);
      
      // Determine next cursor (oldest timestamp in current page)
      const nextCursor = pageActivities.length === ITEMS_PER_PAGE 
        ? pageActivities[pageActivities.length - 1].rsvp.created_at 
        : null;

      return { 
        activities: pageActivities, 
        nextCursor 
      };
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!user?.pubkey && followedKeyString.length > 0,
    staleTime: 2 * 60 * 1000, // Consider data fresh for 2 minutes
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });

  // Flatten all pages into a single array
  const followerActivity = useMemo(() => {
    return data?.pages.flatMap(page => page.activities) ?? [];
  }, [data]);

  const isLoading = isLoadingFollows || isLoadingRSVPs;

  return {
    followerActivity,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    hasFollows: followedPubkeys.length > 0,
  };
}