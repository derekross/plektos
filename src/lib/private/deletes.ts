/**
 * Deletions inside a private event's stream.
 *
 * Applied once, centrally, so every consumer — the event itself, the RSVP
 * roster, the sign-up board, the thread — inherits the same rule instead of
 * each re-deriving it.
 *
 * The rule that matters: **a kind-5 is honoured only from the rumor's own
 * author.** Every guest holds the channel key, so every guest can publish a
 * delete for anything. The app this pattern came from explicitly trusts all of
 * them ("for simplicity in a family app"), which means one guest can erase the
 * host's event or the whole thread. Enforced here instead.
 */
import { KIND_DELETE } from "@/concord/lib/kinds";
import type { OpenedEvent } from "@/concord/lib/stream";

/** Rumor ids deleted by their own author. */
export function deletedRumorIds(opened: readonly OpenedEvent[]): Set<string> {
  const authorOf = new Map<string, string>();
  for (const ev of opened) {
    if (ev.kind !== KIND_DELETE) authorOf.set(ev.rumorId, ev.author);
  }

  const deleted = new Set<string>();
  for (const ev of opened) {
    if (ev.kind !== KIND_DELETE) continue;
    for (const tag of ev.tags) {
      // Unknown targets are ignored rather than remembered: a delete may
      // legitimately arrive before the rumor it refers to, and the next fetch
      // re-evaluates with both in hand.
      if (tag[0] === "e" && authorOf.get(tag[1]) === ev.author) deleted.add(tag[1]);
    }
  }
  return deleted;
}

/** Drop author-deleted rumors, and the tombstones themselves. */
export function filterDeleted(opened: readonly OpenedEvent[]): OpenedEvent[] {
  const deleted = deletedRumorIds(opened);
  return opened.filter((ev) => ev.kind !== KIND_DELETE && !deleted.has(ev.rumorId));
}
