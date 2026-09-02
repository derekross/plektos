/**
 * NIP-52 calendar events over Concord V2 sealed rumors (CORD.md "Calendar
 * Events") — ported from Armada's calendar port so both clients fold
 * bit-for-bit identically.
 *
 * Events are kind 31922 (date-based, `YYYY-MM-DD`) or 31923 (time-based, unix
 * seconds) rumors inside channel wraps. Addressable identity is (author, `d`)
 * within the channel — republishing with the same `d` edits the event. RSVPs
 * are kind 31925 side events referencing the event's rumor id via an `e` tag,
 * tallied latest-per-pubkey.
 */

import {
  KIND_CALENDAR_DATE,
  KIND_CALENDAR_RSVP,
  KIND_CALENDAR_TIME,
} from "@/concord/lib/kinds";
import type { OpenedEvent } from "@/concord/lib/stream";
import { isImagePointer, type ImagePointer } from "@/concord/lib/types";

export { KIND_CALENDAR_DATE, KIND_CALENDAR_TIME, KIND_CALENDAR_RSVP } from "@/concord/lib/kinds";

// ── Types ────────────────────────────────────────────────────────────────────

/** RSVP status (NIP-52). */
export type RsvpStatus = "accepted" | "declined" | "tentative";

/** A participant referenced by a calendar event's `p` tag. */
export interface CalendarParticipant {
  pubkey: string;
  relay?: string;
  role?: string;
}

/** A parsed NIP-52 calendar event folded from a sealed rumor. */
export interface CalendarEvent {
  /** The event's rumor id — what RSVPs and deletes reference. */
  rumorId: string;
  author: string;
  createdAt: number;
  /** Addressable `d` identifier (edits republish with the same `d`). */
  identifier: string;
  kind: typeof KIND_CALENDAR_DATE | typeof KIND_CALENDAR_TIME;
  title: string;
  /** Freeform description (rumor content). */
  description: string;
  summary?: string;
  image?: string;
  /** Encrypted cover, when the host published one. See `CalendarEventInput`. */
  imageEnc?: ImagePointer;
  location?: string;
  /** 31922: `YYYY-MM-DD`. 31923: unix seconds (as a string). */
  start: string;
  end?: string;
  startTzid?: string;
  hashtags: string[];
  references: string[];
  participants: CalendarParticipant[];
  /** Contribution extension: one suggested amount + payment handles. */
  amount?: string;
  cashapp?: string;
  venmo?: string;
  lightning?: string;
}

/** Input for building a calendar-event rumor. */
export interface CalendarEventInput {
  identifier: string;
  kind: typeof KIND_CALENDAR_DATE | typeof KIND_CALENDAR_TIME;
  title: string;
  description?: string;
  summary?: string;
  image?: string;
  /**
   * An ENCRYPTED cover image. Carried in its own `image_enc` tag rather than in
   * `image`, which other NIP-52 clients expect to be a plain URL — they ignore
   * the unknown tag and simply show no cover, instead of rendering a broken one.
   */
  imageEnc?: ImagePointer;
  location?: string;
  start: string;
  end?: string;
  startTzid?: string;
  hashtags?: string[];
  references?: string[];
  participants?: CalendarParticipant[];
  /**
   * Contribution extension (custom tags, ignored by other NIP-52 clients):
   * one suggested amount plus the host's payment handles.
   */
  amount?: string;
  cashapp?: string;
  venmo?: string;
  lightning?: string;
}

/**
 * Most additional people one member may bring. A cap at all is the point —
 * the count rides in an untrusted tag, and an unbounded value would let one
 * RSVP swamp the host's headcount.
 */
export const MAX_GUESTS = 20;

/** A single member's RSVP (latest per pubkey wins). */
export interface RsvpVote {
  pubkey: string;
  status: RsvpStatus;
  /** Ordering timestamp in epoch milliseconds. */
  ms: number;
  /** People brought IN ADDITION to the author. 0 when it's just them. */
  guests: number;
}

/** One member in a tally: who responded, and how many they bring. */
export interface RsvpEntry {
  pubkey: string;
  guests: number;
}

export interface RsvpTally {
  accepted: RsvpEntry[];
  declined: RsvpEntry[];
  tentative: RsvpEntry[];
  mine?: RsvpStatus;
  /** The viewer's own guest count — seeds the stepper. */
  myGuests: number;
  /**
   * People per status (responders + their guests). This — not the entry
   * count — is what the host cooks for, so it's what the UI shows.
   */
  headcount: Record<RsvpStatus, number>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TS_RE = /^\d+$/;
const HEX64 = /^[0-9a-f]{64}$/;

function tag(event: { tags: string[][] }, name: string): string[] | undefined {
  return event.tags.find((t) => t[0] === name);
}

/**
 * Parse an `image_enc` tag. Returns undefined for anything malformed — the tag
 * is attacker-supplied like every other, and a bad pointer must degrade to "no
 * cover", never to a thrown render.
 */
function parseImagePointerTag(raw: string | undefined): ImagePointer | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isImagePointer(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** A short random identifier suitable for a NIP-52 `d` tag. */
export function randomCalendarId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Build the NIP-52 tags for a calendar rumor (channel binding added by the caller). */
export function buildCalendarTags(input: CalendarEventInput): string[][] {
  const tags: string[][] = [
    ["d", input.identifier],
    ["title", input.title],
    ["start", input.start],
  ];
  if (input.end) tags.push(["end", input.end]);
  if (input.kind === KIND_CALENDAR_TIME && input.startTzid) tags.push(["start_tzid", input.startTzid]);
  if (input.summary) tags.push(["summary", input.summary]);
  if (input.image) tags.push(["image", input.image]);
  // The pointer is JSON in its own tag. A reader without the key sees an opaque
  // blob it does not understand and skips it, which is the intended degradation.
  if (input.imageEnc) tags.push(["image_enc", JSON.stringify(input.imageEnc)]);
  if (input.location) tags.push(["location", input.location]);
  // Contribution extension (custom tags; plain NIP-52 clients ignore them).
  if (input.amount) tags.push(["amount", input.amount]);
  if (input.cashapp) tags.push(["cashapp", input.cashapp]);
  if (input.venmo) tags.push(["venmo", input.venmo]);
  if (input.lightning) tags.push(["lightning", input.lightning]);
  for (const t of input.hashtags ?? []) if (t.trim()) tags.push(["t", t.trim()]);
  for (const r of input.references ?? []) if (r.trim()) tags.push(["r", r.trim()]);
  for (const p of input.participants ?? []) {
    if (!HEX64.test(p.pubkey)) continue;
    const t = ["p", p.pubkey, p.relay ?? ""];
    if (p.role) t.push(p.role);
    tags.push(t);
  }
  return tags;
}

/** Parse a kind 31922/31923 rumor into a CalendarEvent (undefined when invalid). */
export function parseCalendarRumor(ev: OpenedEvent): CalendarEvent | undefined {
  if (ev.kind !== KIND_CALENDAR_DATE && ev.kind !== KIND_CALENDAR_TIME) return undefined;
  const identifier = tag(ev, "d")?.[1];
  const title = tag(ev, "title")?.[1];
  const start = tag(ev, "start")?.[1];
  if (!identifier || !title || !start) return undefined;
  if (ev.kind === KIND_CALENDAR_DATE && !DATE_RE.test(start)) return undefined;
  if (ev.kind === KIND_CALENDAR_TIME && !TS_RE.test(start)) return undefined;

  const hashtags: string[] = [];
  const references: string[] = [];
  const participants: CalendarParticipant[] = [];
  for (const [n, v, slot2, slot3] of ev.tags) {
    if (n === "t" && v) hashtags.push(v);
    else if (n === "r" && v) references.push(v);
    else if (n === "p" && HEX64.test(v ?? "")) {
      participants.push({ pubkey: v, relay: slot2 || undefined, role: slot3 || undefined });
    }
  }

  return {
    rumorId: ev.rumorId,
    author: ev.author,
    createdAt: ev.createdAt,
    identifier,
    kind: ev.kind,
    title,
    description: ev.content ?? "",
    summary: tag(ev, "summary")?.[1],
    image: tag(ev, "image")?.[1],
    imageEnc: parseImagePointerTag(tag(ev, "image_enc")?.[1]),
    location: tag(ev, "location")?.[1],
    start,
    end: tag(ev, "end")?.[1] || undefined,
    startTzid: tag(ev, "start_tzid")?.[1],
    hashtags,
    references,
    participants,
    amount: tag(ev, "amount")?.[1],
    cashapp: tag(ev, "cashapp")?.[1],
    venmo: tag(ev, "venmo")?.[1],
    lightning: tag(ev, "lightning")?.[1],
  };
}

/** Sort key for a calendar event: its start as an epoch second. */
export function startEpoch(e: CalendarEvent): number {
  if (e.kind === KIND_CALENDAR_TIME) return Number(e.start) || 0;
  const ms = Date.parse(`${e.start}T00:00:00Z`);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

/** End of an event in epoch seconds, falling back to its start. */
export function endEpoch(e: CalendarEvent): number {
  if (!e.end) return startEpoch(e);
  if (e.kind === KIND_CALENDAR_TIME) return Number(e.end) || startEpoch(e);
  const ms = Date.parse(`${e.end}T00:00:00Z`);
  return Number.isNaN(ms) ? startEpoch(e) : Math.floor(ms / 1000);
}

/** True if the event has not yet ended (upcoming or in progress). */
export function isUpcoming(e: CalendarEvent, now = Math.floor(Date.now() / 1000)): boolean {
  return endEpoch(e) >= now;
}

/**
 * Fold a batch of calendar rumors: keep the newest per addressable coordinate
 * (kind:author:d), drop malformed ones, sort soonest-first.
 */
export function foldCalendarRumors(opened: OpenedEvent[]): CalendarEvent[] {
  const newest = new Map<string, CalendarEvent>();
  for (const ev of opened) {
    const parsed = parseCalendarRumor(ev);
    if (!parsed) continue;
    const coord = `${parsed.kind}:${parsed.author}:${parsed.identifier}`;
    const existing = newest.get(coord);
    if (!existing || existing.createdAt < parsed.createdAt) newest.set(coord, parsed);
  }
  return [...newest.values()].sort((a, b) => startEpoch(a) - startEpoch(b));
}

/**
 * Read the `guests` extension tag (see NIP.md): a non-negative integer count
 * of people brought in addition to the author. Anything unparseable reads as
 * 0 — a stranger's malformed tag must never inflate the host's headcount.
 *
 * A declined RSVP always carries 0, mirroring NIP-52's own rule that `fb` is
 * ignored when the status is `declined`.
 */
function parseGuests(ev: OpenedEvent, status: RsvpStatus): number {
  if (status === "declined") return 0;
  const raw = tag(ev, "guests")?.[1];
  // Digits only. `Number()` alone would accept "1e3" and " 12 " as valid
  // integers, quietly turning a malformed tag into a headcount.
  if (!raw || !TS_RE.test(raw)) return 0;
  return Math.min(Number(raw), MAX_GUESTS);
}

/**
 * The event that gets the featured slot: soonest upcoming, with the community
 * owner's own events ahead of members'. Shared so the Sign-Up board sizes
 * itself against the SAME event the details card shows — two copies of this
 * rule would drift the moment a member posts their own event.
 */
export function pickFeaturedEvent(
  events: CalendarEvent[],
  ownerPubkey: string
): { featured?: CalendarEvent; upcoming: CalendarEvent[] } {
  const owner = ownerPubkey.toLowerCase();
  const upcoming = events.filter((e) => isUpcoming(e));
  upcoming.sort((a, b) => {
    const aOwner = a.author.toLowerCase() === owner ? 0 : 1;
    const bOwner = b.author.toLowerCase() === owner ? 0 : 1;
    return aOwner - bOwner;
  });
  return { featured: upcoming[0], upcoming };
}

/** Parse a kind 31925 RSVP rumor into a vote (undefined when invalid). */
export function parseRsvpRumor(ev: OpenedEvent): { target: string; vote: RsvpVote } | undefined {
  const target = tag(ev, "e")?.[1];
  const status = tag(ev, "status")?.[1];
  if (!target) return undefined;
  if (status !== "accepted" && status !== "declined" && status !== "tentative") return undefined;
  return {
    target,
    vote: { pubkey: ev.author, status, ms: ev.ms, guests: parseGuests(ev, status) },
  };
}

/** Tally RSVPs for one event: latest per pubkey wins, viewer's status surfaced. */
export function tallyRsvps(votes: RsvpVote[], selfPubkey: string | undefined): RsvpTally {
  const latest = new Map<string, RsvpVote>();
  for (const vote of votes) {
    const existing = latest.get(vote.pubkey);
    if (!existing || vote.ms > existing.ms) latest.set(vote.pubkey, vote);
  }
  const tally: RsvpTally = {
    accepted: [],
    declined: [],
    tentative: [],
    myGuests: 0,
    headcount: { accepted: 0, declined: 0, tentative: 0 },
  };
  for (const vote of latest.values()) {
    tally[vote.status].push({ pubkey: vote.pubkey, guests: vote.guests });
    tally.headcount[vote.status] += 1 + vote.guests;
    if (selfPubkey && vote.pubkey === selfPubkey) {
      tally.mine = vote.status;
      tally.myGuests = vote.guests;
    }
  }
  return tally;
}

/** Total people across every status — responders plus their guests. */
export function totalHeadcount(tally: RsvpTally): number {
  return tally.headcount.accepted + tally.headcount.tentative + tally.headcount.declined;
}

/** Format a calendar event's date/time range for display. */
export function formatCalendarEventWhen(event: CalendarEvent): string {
  if (event.kind === KIND_CALENDAR_TIME) {
    const start = new Date(Number(event.start) * 1000);
    const end = event.end ? new Date(Number(event.end) * 1000) : undefined;
    const dateFmt: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
    const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
    const startStr = `${start.toLocaleDateString(undefined, dateFmt)}, ${start.toLocaleTimeString(undefined, timeFmt)}`;
    if (!end) return startStr;
    const sameDay = start.toDateString() === end.toDateString();
    if (sameDay) return `${startStr} – ${end.toLocaleTimeString(undefined, timeFmt)}`;
    return `${startStr} – ${end.toLocaleDateString(undefined, dateFmt)}, ${end.toLocaleTimeString(undefined, timeFmt)}`;
  }
  // Date-based: YYYY-MM-DD (– YYYY-MM-DD), noon-anchored against TZ day-shift.
  const start = new Date(`${event.start}T12:00:00`);
  const dateFmt: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  if (!event.end) return start.toLocaleDateString(undefined, dateFmt);
  const end = new Date(`${event.end}T12:00:00`);
  return `${start.toLocaleDateString(undefined, dateFmt)} – ${end.toLocaleDateString(undefined, dateFmt)}`;
}


/**
 * Group RSVP votes by the event they are FOR, following edits.
 *
 * Rumors have no `a` coordinate, so an RSVP `e`-tags the calendar rumor's id.
 * Editing republishes under the same `d`, which mints a NEW rumor id — so
 * every vote cast before the edit points at a rumor that is no longer the
 * current holder of that coordinate, and would silently vanish from the
 * roster.
 *
 * Map each calendar rumor id to its coordinate, and each coordinate to
 * whichever rumor currently holds it, then move the votes forward.
 *
 * Extracted from the hook so the property can actually be tested: an edit that
 * orphans every RSVP looks exactly like an edit that worked.
 */
export function votesByEvent(
  opened: readonly OpenedEvent[],
  folded: readonly CalendarEvent[],
): Map<string, RsvpVote[]> {
  const coordByRumorId = new Map<string, string>();
  for (const ev of opened) {
    if (ev.kind !== KIND_CALENDAR_DATE && ev.kind !== KIND_CALENDAR_TIME) continue;
    const parsed = parseCalendarRumor(ev);
    if (parsed) {
      coordByRumorId.set(parsed.rumorId, `${parsed.kind}:${parsed.author}:${parsed.identifier}`);
    }
  }

  const currentByCoord = new Map<string, string>();
  for (const e of folded) {
    currentByCoord.set(`${e.kind}:${e.author}:${e.identifier}`, e.rumorId);
  }

  const out = new Map<string, RsvpVote[]>();
  for (const ev of opened) {
    if (ev.kind !== KIND_CALENDAR_RSVP) continue;
    const parsed = parseRsvpRumor(ev);
    if (!parsed) continue;
    const coord = coordByRumorId.get(parsed.target);
    const target = coord ? (currentByCoord.get(coord) ?? parsed.target) : parsed.target;
    const list = out.get(target) ?? [];
    list.push(parsed.vote);
    out.set(target, list);
  }
  return out;
}
