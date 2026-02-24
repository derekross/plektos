import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@/hooks/useNostr';
import { CalendarEvent, BaseEvent } from './eventTypes';

// Helpers to cleanly interact with kind: 31924 NIP-52 events
export interface CalendarData {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  d: string;
  title: string;
  description: string;
  image?: string;
  events: string[]; // List of reference coordinates or ids representing events included
  rejected?: string[]; // List of blocked coordinates
  hashtags?: string[]; // Auto-include events with these hashtags
  locations?: string[]; // Auto-include events matching these locations
  matchType?: 'any' | 'all'; // Determine if filters are joined by OR (any) or AND (all)
}

export function parseCalendarEvent(event: any): CalendarData | null {
  if (event.kind !== 31924) return null;

  const getTag = (key: string) => event.tags.find((t: any) => t[0] === key)?.[1] || '';

  const d = getTag('d');
  const title = getTag('title');
  const image = getTag('image');

  // Extract all the target events referenced within this calendar
  const includedEvents = event.tags
    .filter((t: any) => t[0] === 'a' || t[0] === 'e')
    .map((t: any) => t[1]);

  // Extract blocked/rejected events
  const rejectedEvents = event.tags
    .filter((t: any) => t[0] === 'rejected' || t[0] === '-') // fallback to `-` just in case
    .map((t: any) => t[1]);

  // Extract auto-include filters
  const hashtags = event.tags
    .filter((t: any) => t[0] === 't')
    .map((t: any) => t[1]);

  const locations = event.tags
    .filter((t: any) => t[0] === 'location')
    .map((t: any) => t[1]);

  const matchTypeTag = event.tags.find((t: any) => t[0] === 'match_type');
  const matchType = matchTypeTag && matchTypeTag[1] === 'all' ? 'all' : 'any';

  if (!d || !title) return null;

  return {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind,
    d,
    title,
    description: event.content || '',
    image,
    events: includedEvents,
    rejected: rejectedEvents,
    hashtags,
    locations,
    matchType
  };
}

export function useUserCalendars(pubkey?: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['calendars', 'user', pubkey],
    enabled: !!pubkey && !!nostr,
    queryFn: async () => {
      if (!pubkey) return [];

      const events = await nostr.query([
        {
          kinds: [31924],
          authors: [pubkey],
          limit: 100
        }
      ]);

      const parsed = events
        .map(parseCalendarEvent)
        .filter((c): c is CalendarData => c !== null);

      return parsed.sort((a, b) => b.created_at - a.created_at);
    }
  });
}

// Coordinate format is commonly required for NIP-52 (kind:pubkey:d-identifier) 
// and `a` tag resolution
export function createCoordinate(kind: number, pubkey: string, d: string) {
  return `${kind}:${pubkey}:${d}`;
}

export async function addEventToCalendar(
  nostr: any,
  createEvent: any,
  calendarCoordinate: string,
  eventCoordinate: string
) {
  // 1. Fetch the exact calendar event from relays
  const parts = calendarCoordinate.split(':');
  if (parts.length !== 3) throw new Error("Invalid calendar coordinate");

  const [, pubkey, dTag] = parts;

  const events = await nostr.query([
    {
      kinds: [31924],
      authors: [pubkey],
      '#d': [dTag],
    }
  ]);

  if (events.length === 0) {
    throw new Error("Calendar not found");
  }

  // 2. Extract existing tags
  const calendarEvent = events[0];
  const existingTags = [...calendarEvent.tags];

  // 3. Check if the event is already in the calendar
  const isDuplicate = existingTags.some(
    (tag: any) => (tag[0] === 'a' || tag[0] === 'e') && tag[1] === eventCoordinate
  );

  if (isDuplicate) {
    throw new Error("Event is already in this calendar");
  }

  // 4. Determine if we are adding an 'a' tag (replaceable) or 'e' tag (regular)
  const isReplaceable = eventCoordinate.includes(':');
  const tagType = isReplaceable ? 'a' : 'e';

  // 5. Append the new tag
  existingTags.push([tagType, eventCoordinate]);

  // 6. Republish the calendar event
  return new Promise((resolve, reject) => {
    createEvent({
      kind: 31924,
      content: calendarEvent.content,
      tags: existingTags,
    }, {
      onSuccess: resolve,
      onError: reject
    });
  });
}

export async function removeEventFromCalendar(
  nostr: any,
  createEvent: any,
  calendarCoordinate: string,
  eventCoordinate: string
) {
  // 1. Fetch the exact calendar event from relays
  const parts = calendarCoordinate.split(':');
  if (parts.length !== 3) throw new Error("Invalid calendar coordinate");

  const [, pubkey, dTag] = parts;

  const events = await nostr.query([
    {
      kinds: [31924],
      authors: [pubkey],
      '#d': [dTag],
    }
  ]);

  if (events.length === 0) {
    throw new Error("Calendar not found");
  }

  // 2. Extract existing tags and remove the target
  const calendarEvent = events[0];
  const originalCount = calendarEvent.tags.length;

  const newTags = calendarEvent.tags.filter((tag: any) => {
    if (tag[0] === 'a' || tag[0] === 'e') {
      return tag[1] !== eventCoordinate;
    }
    return true;
  });

  if (newTags.length === originalCount) {
    throw new Error("Event is not in this calendar");
  }

  // 3. Republish the calendar event
  return new Promise((resolve, reject) => {
    createEvent({
      kind: 31924,
      content: calendarEvent.content,
      tags: newTags,
    }, {
      onSuccess: resolve,
      onError: reject
    });
  });
}

export async function deleteCalendarEvent(
  nostr: any,
  createEvent: any,
  calendarCoordinate: string
) {
  // 1. Fetch the exact calendar event from relays to get its ID
  const parts = calendarCoordinate.split(':');
  if (parts.length !== 3) throw new Error("Invalid calendar coordinate");

  const [, pubkey, dTag] = parts;

  const events = await nostr.query([
    {
      kinds: [31924],
      authors: [pubkey],
      '#d': [dTag],
    }
  ]);

  if (events.length === 0) {
    throw new Error("Calendar not found");
  }

  const eventId = events[0].id;

  // 2. Discard the calendar using a NIP-09 deletion event indicating both its ID and coordinate
  return new Promise((resolve, reject) => {
    createEvent({
      kind: 5,
      content: "Deleted group calendar",
      tags: [
        ['e', eventId],
        ['a', calendarCoordinate]
      ],
    }, {
      onSuccess: resolve,
      onError: reject
    });
  });
}

export async function rejectEventFromCalendar(
  nostr: any,
  createEvent: any,
  calendarCoordinate: string,
  eventCoordinate: string
) {
  // 1. Fetch the exact calendar event from relays
  const parts = calendarCoordinate.split(':');
  if (parts.length !== 3) throw new Error("Invalid calendar coordinate");

  const [, pubkey, dTag] = parts;

  const events = await nostr.query([
    {
      kinds: [31924],
      authors: [pubkey],
      '#d': [dTag],
    }
  ]);

  if (events.length === 0) {
    throw new Error("Calendar not found");
  }

  // 2. Extract existing tags
  const calendarEvent = events[0];
  const existingTags = [...calendarEvent.tags];

  // 3. Prevent duplicate rejections
  const isDuplicate = existingTags.some(
    (tag: any) => (tag[0] === 'rejected' || tag[0] === '-') && tag[1] === eventCoordinate
  );

  if (isDuplicate) {
    throw new Error("Event is already rejected");
  }

  // 4. Append the new rejection tag
  existingTags.push(['rejected', eventCoordinate]);

  // 5. Republish the calendar event
  return new Promise((resolve, reject) => {
    createEvent({
      kind: 31924,
      content: calendarEvent.content,
      tags: existingTags,
    }, {
      onSuccess: resolve,
      onError: reject
    });
  });
}
