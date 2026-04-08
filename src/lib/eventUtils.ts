import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { NostrFilter } from "@jsr/nostrify__types";
import type { DateBasedEvent, TimeBasedEvent, EventRSVP, LiveEvent, RoomMeeting, InteractiveRoom } from "./eventTypes";
import { cacheEvent, getCachedEvents, getCachedRSVPs } from "./indexedDB";
import { nip19 } from "nostr-tools";

type CalendarEvent = DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom;
type AllEventTypes = CalendarEvent | EventRSVP;

// Helper to deduplicate events
function deduplicateEvents(events: AllEventTypes[]): AllEventTypes[] {
  const seenCoordinates = new Map<string, { event: AllEventTypes; created_at: number }>();
  const result: AllEventTypes[] = [];

  for (const event of events) {
    // For RSVP events, keep all
    if (event.kind === 31925) {
      result.push(event);
      continue;
    }

    // For replaceable events
    if (event.kind === 31922 || event.kind === 31923 || event.kind === 30311 || event.kind === 30312 || event.kind === 30313) {
      const dTag = event.tags.find(tag => tag[0] === 'd')?.[1];
      if (!dTag || dTag.includes('booking-')) continue;

      const coordinate = `${event.kind}:${event.pubkey}:${dTag}`;
      const existing = seenCoordinates.get(coordinate);

      if (!existing || event.created_at > existing.created_at) {
        seenCoordinates.set(coordinate, { event, created_at: event.created_at });
      }
      continue;
    }

    result.push(event);
  }

  // Add deduplicated replaceable events
  for (const { event } of seenCoordinates.values()) {
    result.push(event);
  }

  return result;
}

export function useEvents(options?: {
  timeRange?: { start: number; end: number };
  limit?: number;
  includeRSVPs?: boolean;
}) {
  const { nostr } = useNostr();
  const { timeRange, limit = 100, includeRSVPs = true } = options || {};
  const [cachedData, setCachedData] = useState<AllEventTypes[] | undefined>(undefined);

  // Load cached data on mount (instant)
  useEffect(() => {
    async function loadCache() {
      try {
        const [cachedEvents, cachedRsvps] = await Promise.all([
          getCachedEvents(),
          includeRSVPs ? getCachedRSVPs() : Promise.resolve([]),
        ]);

        if (cachedEvents.length > 0 || cachedRsvps.length > 0) {
          const allCached = [...cachedEvents, ...cachedRsvps] as AllEventTypes[];
          setCachedData(deduplicateEvents(allCached));
        }
      } catch {
        // Cache read failed, continue without cache
      }
    }
    loadCache();
  }, [includeRSVPs]);

  return useQuery({
    queryKey: ["events", timeRange, limit, includeRSVPs],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);
      try {
        // Build filters based on options
        const filters: NostrFilter[] = [];

        // Main calendar events filter
        const calendarFilter: NostrFilter = {
          kinds: [31922, 31923, 30311, 30312, 30313],
          limit,
        };

        // Add time-based filtering if specified
        if (timeRange) {
          calendarFilter.since = Math.floor(timeRange.start / 1000) - (30 * 24 * 60 * 60);
          calendarFilter.until = Math.floor(timeRange.end / 1000) + (30 * 24 * 60 * 60);
        }

        filters.push(calendarFilter);

        // RSVP events filter (if requested)
        if (includeRSVPs) {
          const rsvpFilter: NostrFilter = {
            kinds: [31925],
            limit: Math.floor(limit / 2),
          };

          if (timeRange) {
            rsvpFilter.since = Math.floor(timeRange.start / 1000) - (30 * 24 * 60 * 60);
            rsvpFilter.until = Math.floor(timeRange.end / 1000) + (30 * 24 * 60 * 60);
          }

          filters.push(rsvpFilter);
        }

        const events = await nostr.query(filters, { signal });

        if (!events || events.length === 0) {
          // If no new events, just use the cache
          const [cachedEvents, cachedRsvps] = await Promise.all([
            getCachedEvents(),
            includeRSVPs ? getCachedRSVPs() : Promise.resolve([]),
          ]);

          if (cachedEvents.length > 0 || cachedRsvps.length > 0) {
            const allCached = [...cachedEvents, ...cachedRsvps] as AllEventTypes[];
            return deduplicateEvents(allCached);
          }
          return [];
        }

        const typedEvents = events as unknown as AllEventTypes[];

        // Cache new events in background (non-blocking)
        Promise.all(typedEvents.map(event => cacheEvent(event))).catch(() => { });

        // Fetch current cache to merge with new events
        const [cachedEvents, cachedRsvps] = await Promise.all([
          getCachedEvents(),
          includeRSVPs ? getCachedRSVPs() : Promise.resolve([]),
        ]);

        // Merge and deduplicate
        const allCached = [...cachedEvents, ...cachedRsvps] as AllEventTypes[];
        const combined = [...allCached, ...typedEvents];

        return deduplicateEvents(combined);
      } catch {
        return [];
      }
    },
    // Use cached data as placeholder for instant display
    placeholderData: cachedData,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
}

// Hook specifically optimized for calendar views
export function useCalendarEvents(currentMonth: Date) {
  const startOfRange = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  const endOfRange = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 2, 0, 23, 59, 59, 999);

  return useEvents({
    timeRange: {
      start: startOfRange.getTime(),
      end: endOfRange.getTime(),
    },
    limit: 500,
    includeRSVPs: true,
  });
}

// Hook for loading a specific event by its identifier
export function useSingleEvent(eventIdentifier: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ["event", eventIdentifier],
    queryFn: async (c) => {
      if (!eventIdentifier) {
        throw new Error("No event identifier provided");
      }

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(2000)]);

      try {
        const decoded = nip19.decode(eventIdentifier);

        if (decoded.type === 'naddr') {
          const { kind, pubkey, identifier } = decoded.data;
          const events = await nostr.query([{
            kinds: [kind],
            authors: [pubkey],
            "#d": [identifier],
            limit: 1
          }], { signal });

          return events[0] as unknown as DateBasedEvent | TimeBasedEvent | LiveEvent || null;
        } else if (decoded.type === 'nevent' || decoded.type === 'note') {
          const eventId = decoded.type === 'note' ? decoded.data : decoded.data.id;
          const events = await nostr.query([{
            ids: [eventId],
            limit: 1
          }], { signal });

          return events[0] as unknown as DateBasedEvent | TimeBasedEvent | LiveEvent || null;
        } else {
          const events = await nostr.query([{
            ids: [eventIdentifier],
            limit: 1
          }], { signal });

          return events[0] as unknown as DateBasedEvent | TimeBasedEvent || null;
        }
      } catch {
        try {
          const events = await nostr.query([{
            ids: [eventIdentifier],
            limit: 1
          }], { signal });

          return events[0] as unknown as DateBasedEvent | TimeBasedEvent || null;
        } catch {
          return null;
        }
      }
    },
    enabled: !!eventIdentifier,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    retryDelay: 1000,
  });
}
