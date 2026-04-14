import Dexie, { Table } from "dexie";
import type { NostrEvent } from "@nostrify/nostrify";
import type { DateBasedEvent, TimeBasedEvent, EventRSVP, LiveEvent, RoomMeeting, InteractiveRoom } from "./eventTypes";

type CalendarEvent = DateBasedEvent | TimeBasedEvent | LiveEvent | RoomMeeting | InteractiveRoom;

interface CachedProfile {
  pubkey: string;
  event: NostrEvent;
  metadata: {
    name?: string;
    display_name?: string;
    about?: string;
    picture?: string;
    banner?: string;
    nip05?: string;
    lud16?: string;
    lud06?: string;
    website?: string;
  };
  cachedAt: number;
}

interface CachedFollowList {
  pubkey: string;
  event: NostrEvent;
  followedPubkeys: string[];
  cachedAt: number;
}

class EventDatabase extends Dexie {
  events!: Table<CalendarEvent>;
  rsvps!: Table<EventRSVP>;
  profiles!: Table<CachedProfile>;
  followLists!: Table<CachedFollowList>;

  constructor() {
    super("PlektosDatabase");
    // Version 2 adds profiles and followLists tables
    this.version(2).stores({
      events: "id, pubkey, created_at, kind",
      rsvps: "id, pubkey, created_at, kind",
      profiles: "pubkey, cachedAt",
      followLists: "pubkey, cachedAt",
    });
  }
}

export const db = new EventDatabase();

// Event caching
export async function cacheEvent(
  event: DateBasedEvent | TimeBasedEvent | EventRSVP | LiveEvent | RoomMeeting | InteractiveRoom
) {
  try {
    if (event.kind === 31925) {
      await db.rsvps.put(event as EventRSVP);
    } else {
      await db.events.put(event as CalendarEvent);
    }
  } catch {
    // Silently fail - caching is optional
  }
}

// Maximum number of cached events/RSVPs to return (prevents unbounded memory usage)
const MAX_CACHED_EVENTS = 500;
const MAX_CACHED_RSVPS = 500;

export async function getCachedEvents(): Promise<CalendarEvent[]> {
  try {
    // Return only the most recent events, sorted by created_at descending
    return await db.events.orderBy("created_at").reverse().limit(MAX_CACHED_EVENTS).toArray();
  } catch {
    return [];
  }
}

export async function getCachedRSVPs(): Promise<EventRSVP[]> {
  try {
    return await db.rsvps.orderBy("created_at").reverse().limit(MAX_CACHED_RSVPS).toArray();
  } catch {
    return [];
  }
}

// Profile caching
export async function cacheProfile(
  pubkey: string,
  event: NostrEvent,
  metadata: CachedProfile["metadata"]
) {
  try {
    await db.profiles.put({
      pubkey,
      event,
      metadata,
      cachedAt: Date.now(),
    });
  } catch {
    // Silently fail
  }
}

export async function cacheProfiles(
  profiles: Array<{ pubkey: string; event: NostrEvent; metadata: CachedProfile["metadata"] }>
) {
  try {
    const cachedAt = Date.now();
    await db.profiles.bulkPut(
      profiles.map(p => ({ ...p, cachedAt }))
    );
  } catch {
    // Silently fail
  }
}

export async function getCachedProfile(pubkey: string): Promise<CachedProfile | undefined> {
  try {
    return await db.profiles.get(pubkey);
  } catch {
    return undefined;
  }
}

export async function getCachedProfiles(pubkeys: string[]): Promise<Map<string, CachedProfile>> {
  try {
    const profiles = await db.profiles.where("pubkey").anyOf(pubkeys).toArray();
    return new Map(profiles.map(p => [p.pubkey, p]));
  } catch {
    return new Map();
  }
}

export async function getAllCachedProfiles(): Promise<CachedProfile[]> {
  try {
    return await db.profiles.toArray();
  } catch {
    return [];
  }
}

// Follow list caching
export async function cacheFollowList(
  pubkey: string,
  event: NostrEvent,
  followedPubkeys: string[]
) {
  try {
    await db.followLists.put({
      pubkey,
      event,
      followedPubkeys,
      cachedAt: Date.now(),
    });
  } catch {
    // Silently fail
  }
}

export async function getCachedFollowList(pubkey: string): Promise<CachedFollowList | undefined> {
  try {
    return await db.followLists.get(pubkey);
  } catch {
    return undefined;
  }
}

// Cache cleanup - remove entries older than specified duration
export async function cleanupOldCache(maxAgeMs: number = 24 * 60 * 60 * 1000) {
  try {
    const cutoff = Date.now() - maxAgeMs;
    const cutoffSeconds = Math.floor(cutoff / 1000);

    await Promise.all([
      db.profiles.where("cachedAt").below(cutoff).delete(),
      db.followLists.where("cachedAt").below(cutoff).delete(),
      // Clean up old events and RSVPs based on created_at (Unix seconds)
      db.events.where("created_at").below(cutoffSeconds).delete(),
      db.rsvps.where("created_at").below(cutoffSeconds).delete(),
    ]);
  } catch {
    // Silently fail
  }
}
