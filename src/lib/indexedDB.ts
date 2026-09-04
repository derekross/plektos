import type { Table } from "dexie";
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

interface EventDb {
  events: Table<CalendarEvent>;
  rsvps: Table<EventRSVP>;
  profiles: Table<CachedProfile>;
  followLists: Table<CachedFollowList>;
}

/**
 * Dexie, loaded on first use rather than at import time.
 *
 * It is ~94 kB, and this module is reached from `useAuthor` — which is on
 * essentially every screen — so a static import put all of it in the initial
 * bundle, ahead of first paint, to serve a cache that only matters once
 * something has been cached. Every caller here is already `async`, so
 * awaiting the module costs them nothing they were not already awaiting.
 *
 * The promise is memoised, not the database: a failed import (offline, a
 * pruned chunk after a deploy) must be retryable rather than poisoning the
 * cache for the session.
 */
let dbPromise: Promise<EventDb> | undefined;

function getDb(): Promise<EventDb> {
  if (!dbPromise) {
    dbPromise = import("dexie").then(({ default: Dexie }) => {
      class EventDatabase extends Dexie {
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
      return new EventDatabase() as unknown as EventDb;
    });
    dbPromise.catch(() => {
      dbPromise = undefined;
    });
  }
  return dbPromise;
}

// Event caching
export async function cacheEvent(
  event: DateBasedEvent | TimeBasedEvent | EventRSVP | LiveEvent | RoomMeeting | InteractiveRoom
) {
  try {
    if (event.kind === 31925) {
      await (await getDb()).rsvps.put(event as EventRSVP);
    } else {
      await (await getDb()).events.put(event as CalendarEvent);
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
    return await (await getDb()).events.orderBy("created_at").reverse().limit(MAX_CACHED_EVENTS).toArray();
  } catch {
    return [];
  }
}

export async function getCachedRSVPs(): Promise<EventRSVP[]> {
  try {
    return await (await getDb()).rsvps.orderBy("created_at").reverse().limit(MAX_CACHED_RSVPS).toArray();
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
    await (await getDb()).profiles.put({
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
    await (await getDb()).profiles.bulkPut(
      profiles.map(p => ({ ...p, cachedAt }))
    );
  } catch {
    // Silently fail
  }
}

export async function getCachedProfile(pubkey: string): Promise<CachedProfile | undefined> {
  try {
    return await (await getDb()).profiles.get(pubkey);
  } catch {
    return undefined;
  }
}

export async function getCachedProfiles(pubkeys: string[]): Promise<Map<string, CachedProfile>> {
  try {
    const profiles = await (await getDb()).profiles.where("pubkey").anyOf(pubkeys).toArray();
    return new Map(profiles.map(p => [p.pubkey, p]));
  } catch {
    return new Map();
  }
}

export async function getAllCachedProfiles(): Promise<CachedProfile[]> {
  try {
    return await (await getDb()).profiles.toArray();
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
    await (await getDb()).followLists.put({
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
    return await (await getDb()).followLists.get(pubkey);
  } catch {
    return undefined;
  }
}

// Trim a table to at most `max` rows, deleting those with the oldest created_at
async function trimByCount(table: Table<CalendarEvent> | Table<EventRSVP>, max: number) {
  const count = await table.count();
  if (count <= max) return;
  const oldestKeys = await table
    .orderBy("created_at")
    .limit(count - max)
    .primaryKeys();
  await table.bulkDelete(oldestKeys);
}

// Cache cleanup. Profiles and follow lists expire by cache age. Calendar
// events and RSVPs must NOT be evicted by created_at (that's the publish
// time — an event published last month can be scheduled for next month),
// so they are only capped by count.
export async function cleanupOldCache(maxAgeMs: number = 24 * 60 * 60 * 1000) {
  try {
    const cutoff = Date.now() - maxAgeMs;
    const db = await getDb();

    await Promise.all([
      db.profiles.where("cachedAt").below(cutoff).delete(),
      db.followLists.where("cachedAt").below(cutoff).delete(),
      trimByCount(db.events, MAX_CACHED_EVENTS),
      trimByCount(db.rsvps, MAX_CACHED_RSVPS),
    ]);
  } catch {
    // Silently fail
  }
}
