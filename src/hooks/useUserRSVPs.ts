import { useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { DateBasedEvent, TimeBasedEvent, LiveEvent, RoomMeeting, InteractiveRoom, EventRSVP } from "@/lib/eventTypes";

type CalendarEventType = DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom;

interface UserRSVPWithEvent {
  rsvp: EventRSVP;
  event: CalendarEventType;
  status: string;
  eventTitle: string;
  eventDate: Date;
  eventStartTime?: string;
}

interface UserTicketWithEvent {
  zapReceipt: {
    id: string;
    kind: number;
    pubkey: string;
    created_at: number;
    content: string;
    tags: string[][];
  }; // Zap receipt event (kind 9735)
  event: CalendarEventType;
  amount: number;
  eventTitle: string;
  eventDate: Date;
  eventStartTime?: string;
  isTicket: boolean; // true for purchased tickets, false for RSVPs
  sequenceNumber?: number; // 1, 2, 3, etc. for this event
  totalTickets?: number; // Total tickets purchased for this event
}

interface UserCreatedEvent {
  event: CalendarEventType;
  eventTitle: string;
  eventDate: Date;
  eventStartTime?: string;
  isCreated: true;
}

export type { UserRSVPWithEvent, UserTicketWithEvent, UserCreatedEvent };

export function useUserRSVPs() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  // Fetch user's RSVP events (kind 31925)
  const { data: rsvps = [], isLoading: isLoadingRSVPs } = useQuery({
    queryKey: ["userRSVPs", user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return [];
      const events = await nostr.query(
        [{ kinds: [31925], authors: [user.pubkey] }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) }
      );
      return events as unknown as EventRSVP[];
    },
    enabled: !!user?.pubkey,
    retry: 1,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Fetch user's purchased tickets (zap receipts where user is the sender/author)
  const { data: zapReceipts = [], isLoading: isLoadingZapReceipts } = useQuery({
    queryKey: ["userZapReceipts", user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return [];
      const events = await nostr.query(
        [{ kinds: [9735], authors: [user.pubkey] }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) }
      );
      return events;
    },
    enabled: !!user?.pubkey,
    retry: 1,
    staleTime: 30000,
  });

  // Fetch the actual events that were RSVP'd to
  const { data: rsvpEvents = [], isLoading: isLoadingRsvpEvents } = useQuery({
    queryKey: ["userRSVPEvents", rsvps],
    queryFn: async ({ signal }) => {
      if (!rsvps.length) return [];

      // Extract event IDs from e tags
      const eventIds = rsvps
        .map((rsvp) => rsvp.tags.find((tag) => tag[0] === "e")?.[1])
        .filter((id): id is string => id !== undefined);

      // Extract address coordinates from a tags and parse them
      const addressCoords = rsvps
        .map((rsvp) => rsvp.tags.find((tag) => tag[0] === "a")?.[1])
        .filter((addr): addr is string => addr !== undefined)
        .map((addr) => {
          const [kind, pubkey, identifier] = addr.split(':');
          return { kind: parseInt(kind), pubkey, identifier };
        })
        .filter(coord => coord.kind && coord.pubkey && coord.identifier);

      const filters: Array<{
        kinds: number[];
        ids?: string[];
        authors?: string[];
        '#d'?: string[];
      }> = [];

      // Query by event IDs if we have any
      if (eventIds.length > 0) {
        filters.push({
          kinds: [31922, 31923, 30311, 30312, 30313],
          ids: eventIds
        });
      }

      // Query by address coordinates for replaceable events
      for (const coord of addressCoords) {
        filters.push({
          kinds: [coord.kind],
          authors: [coord.pubkey],
          '#d': [coord.identifier]
        });
      }

      if (filters.length === 0) return [];

      const events = await nostr.query(
        filters,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) }
      );

      // Deduplicate events by ID (in case same event was fetched via multiple filters)
      const uniqueEvents = events.reduce((acc, event) => {
        if (!acc.find(e => e.id === event.id)) {
          acc.push(event);
        }
        return acc;
      }, [] as typeof events);

      return uniqueEvents as unknown as (DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom)[];
    },
    enabled: !!rsvps.length,
    retry: 1,
    staleTime: 30000,
  });

  // Fetch events created by the user (they're the organizer)
  const { data: createdEvents = [], isLoading: isLoadingCreatedEvents } = useQuery({
    queryKey: ["userCreatedEvents", user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return [];
      const events = await nostr.query(
        [{ kinds: [31922, 31923, 30311, 30312, 30313], authors: [user.pubkey], limit: 100 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) }
      );
      return events as unknown as CalendarEventType[];
    },
    enabled: !!user?.pubkey,
    retry: 1,
    staleTime: 30000,
  });

  // Fetch events for zap receipts (purchased tickets)
  const { data: ticketEvents = [], isLoading: isLoadingTicketEvents } = useQuery({
    queryKey: ["userTicketEvents", zapReceipts],
    queryFn: async ({ signal }) => {
      if (!zapReceipts.length) return [];

      // Extract event IDs from zap receipts
      const eventIds = zapReceipts
        .map((receipt) => receipt.tags.find((tag) => tag[0] === "e")?.[1])
        .filter((id): id is string => id !== undefined);

      if (eventIds.length === 0) return [];

      const events = await nostr.query(
        [{ kinds: [31922, 31923, 30311, 30312, 30313], ids: eventIds }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) }
      );

      return events as unknown as (DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom)[];
    },
    enabled: !!zapReceipts.length,
    retry: 1,
    staleTime: 30000,
  });

  const processedQuery = useQuery({
    queryKey: ["processedUserTickets", rsvps, rsvpEvents, zapReceipts, ticketEvents, createdEvents],
    queryFn: async (): Promise<{ upcoming: (UserRSVPWithEvent | UserTicketWithEvent | UserCreatedEvent)[], past: (UserRSVPWithEvent | UserTicketWithEvent | UserCreatedEvent)[] }> => {

      const processedRSVPs: UserRSVPWithEvent[] = [];
      const processedTickets: UserTicketWithEvent[] = [];
      const now = new Date();

      // Process RSVPs
      if (rsvps.length) {
        if (rsvpEvents.length) {
          // First, deduplicate RSVPs to get only the latest RSVP for each event
          const eventToLatestRSVP = new Map<string, EventRSVP>();

        for (const rsvp of rsvps) {
        const eventId = rsvp.tags.find((tag) => tag[0] === "e")?.[1];
        const addressTag = rsvp.tags.find((tag) => tag[0] === "a")?.[1];

        // Create a unique key for this event (prefer address coordinate over event ID)
        const eventKey = addressTag || eventId;
        if (!eventKey) continue;

        const existing = eventToLatestRSVP.get(eventKey);
        if (!existing || rsvp.created_at > existing.created_at) {
          eventToLatestRSVP.set(eventKey, rsvp);
        }
      }

      // Now process only the latest RSVP for each event
      for (const rsvp of eventToLatestRSVP.values()) {
        const eventId = rsvp.tags.find((tag) => tag[0] === "e")?.[1];
        const addressTag = rsvp.tags.find((tag) => tag[0] === "a")?.[1];
        const status = rsvp.tags.find((tag) => tag[0] === "status")?.[1] || "accepted";

        // Try to find event by ID first, then by address coordinate
        let event = eventId ? rsvpEvents.find((e) => e.id === eventId) : undefined;

        if (!event && addressTag) {
          const [kind, pubkey, identifier] = addressTag.split(':');
          event = rsvpEvents.find((e) =>
            e.kind === parseInt(kind) &&
            e.pubkey === pubkey &&
            e.tags.some((tag) => tag[0] === "d" && tag[1] === identifier)
          );
        }

        if (!event) continue;

        const title = event.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled";
          let startTime = event.tags.find((tag) => tag[0] === "start")?.[1];

          if (!startTime) {
            // For live events, try alternative time tags
            const alternativeStartTime = event.tags.find((tag) => 
              tag[0] === "start_tzid" || 
              tag[0] === "published_at" || 
              tag[0] === "created_at"
            )?.[1];
            
            if (alternativeStartTime) {
              startTime = alternativeStartTime;
            } else {
              // For live events without start time, treat as ongoing (show in upcoming)
              startTime = "0"; // Use epoch time to ensure it's treated as upcoming
            }
          }

        let eventDate: Date;

        try {
          // Determine the date format based on the startTime value, not just the event kind
          if (startTime.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Date-only format: YYYY-MM-DD
            eventDate = new Date(startTime + "T00:00:00Z");
          } else if (startTime.match(/^\d{10}$/)) {
            // Unix timestamp (10 digits)
            eventDate = new Date(parseInt(startTime) * 1000);
          } else if (startTime.match(/^\d{13}$/)) {
            // Unix timestamp in milliseconds (13 digits)
            eventDate = new Date(parseInt(startTime));
          } else if (startTime === "0") {
            // For live events without start time, treat them as past by default
            // Set the event date to the event creation time (which is in the past)
            const eventCreatedAt = event.created_at * 1000; // Convert to milliseconds
            eventDate = new Date(eventCreatedAt);
          } else {
            continue;
          }

          // Check if the date is valid
          if (isNaN(eventDate.getTime())) {
            continue;
          }

        } catch {
          continue;
        }


        processedRSVPs.push({
          rsvp,
          event,
          status,
          eventTitle: title,
          eventDate,
          eventStartTime: startTime,
        });
        }
        }
      }

      // Process purchased tickets (zap receipts) - show all individually with sequence numbers
      if (zapReceipts.length && ticketEvents.length) {
        // Group tickets by event ID to calculate sequence numbers
        const ticketsByEvent = new Map<string, unknown[]>();

        for (const receipt of zapReceipts) {
          const eventId = receipt.tags.find((tag) => tag[0] === "e")?.[1];
          if (!eventId) continue;

          const event = ticketEvents.find((e) => e.id === eventId);
          if (!event) continue;

          if (!ticketsByEvent.has(eventId)) {
            ticketsByEvent.set(eventId, []);
          }

          ticketsByEvent.get(eventId)!.push(receipt);
        }

        // Process each event's tickets individually with sequence numbers
        for (const [eventId, receipts] of ticketsByEvent) {
          const event = ticketEvents.find((e) => e.id === eventId);
          if (!event) continue;

          const title = event.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled";
          const startTime = event.tags.find((tag) => tag[0] === "start")?.[1];
          
          if (!startTime) continue;

          let eventDate: Date;

          if (event.kind === 31922) {
            // Date-only events: startTime is YYYY-MM-DD format
            eventDate = new Date(startTime + "T00:00:00Z");
          } else {
            // Time-based events (31923) and live events (30311, 30312, 30313): startTime is Unix timestamp
            eventDate = new Date(parseInt(startTime) * 1000);
          }

          // Sort receipts by creation time (oldest first for consistent numbering)
          const sortedReceipts = receipts.sort((a, b) => {
            const aReceipt = a as { created_at: number };
            const bReceipt = b as { created_at: number };
            return aReceipt.created_at - bReceipt.created_at;
          });

          // Create individual ticket entries with sequence numbers
          sortedReceipts.forEach((receipt, index) => {
            const receiptData = receipt as {
              id: string;
              kind: number;
              pubkey: string;
              created_at: number;
              content: string;
              tags: string[][];
            };

            // Parse zap request to get amount
            const descriptionTag = receiptData.tags.find((tag) => tag[0] === "description")?.[1];
            let amount = 0;
            if (descriptionTag) {
              try {
                const zapRequest = JSON.parse(descriptionTag);
                const amountTag = zapRequest.tags?.find((tag: string[]) => tag[0] === "amount");
                if (amountTag) {
                  amount = Math.floor(parseInt(amountTag[1]) / 1000); // Convert from millisats to sats
                }
              } catch {
                // Failed to parse zap request amount
              }
            }

            processedTickets.push({
              zapReceipt: receiptData,
              event,
              amount,
              eventTitle: title,
              eventDate,
              eventStartTime: startTime,
              isTicket: true,
              sequenceNumber: index + 1, // 1, 2, 3, etc.
              totalTickets: sortedReceipts.length, // Total tickets for this event
            });
          });
        }
      }

      // Process user-created events
      const processedCreated: UserCreatedEvent[] = [];
      // Track event IDs that already appear via RSVP or ticket to avoid duplicates
      const seenEventIds = new Set<string>();
      for (const item of processedRSVPs) seenEventIds.add(item.event.id);
      for (const item of processedTickets) seenEventIds.add(item.event.id);

      for (const event of createdEvents) {
        if (seenEventIds.has(event.id)) continue;

        const title = event.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled";
        const startTag = event.kind === 30311 || event.kind === 30312 || event.kind === 30313
          ? event.tags.find((tag) => tag[0] === "starts")?.[1]
          : event.tags.find((tag) => tag[0] === "start")?.[1];

        let eventDate: Date;
        try {
          if (!startTag || startTag === "0") {
            eventDate = new Date(event.created_at * 1000);
          } else if (startTag.match(/^\d{4}-\d{2}-\d{2}$/)) {
            eventDate = new Date(startTag + "T00:00:00Z");
          } else if (startTag.match(/^\d{10}$/)) {
            eventDate = new Date(parseInt(startTag) * 1000);
          } else if (startTag.match(/^\d{13}$/)) {
            eventDate = new Date(parseInt(startTag));
          } else {
            eventDate = new Date(event.created_at * 1000);
          }
          if (isNaN(eventDate.getTime())) continue;
        } catch {
          continue;
        }

        // Filter out events with d-tags containing "booking-" (internal)
        const dTag = event.tags.find((tag) => tag[0] === "d")?.[1];
        if (dTag?.includes("booking-")) continue;

        processedCreated.push({
          event,
          eventTitle: title,
          eventDate,
          eventStartTime: startTag,
          isCreated: true,
        });
      }

      // Combine RSVPs, tickets, and created events
      const allItems: (UserRSVPWithEvent | UserTicketWithEvent | UserCreatedEvent)[] = [
        ...processedRSVPs,
        ...processedTickets,
        ...processedCreated,
      ];

      const upcoming = allItems
        .filter(item => item.eventDate >= now)
        .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());

      const past = allItems
        .filter(item => item.eventDate < now)
        .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime());

      return { upcoming, past };
    },
    enabled: !!rsvps.length || !!zapReceipts.length || !!createdEvents.length,
    staleTime: 30000,
  });

  return {
    data: processedQuery.data,
    isLoading: isLoadingRSVPs || isLoadingRsvpEvents || isLoadingZapReceipts || isLoadingTicketEvents || isLoadingCreatedEvents || processedQuery.isLoading,
    error: processedQuery.error,
  };
}
