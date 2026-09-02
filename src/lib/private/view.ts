/**
 * The public/private boundary, expressed in the type system.
 *
 * This is the single most important file for not leaking a private event, and
 * the reason is structural rather than stylistic.
 *
 * A private event is an unsigned rumor inside an encrypted stream. It has no
 * `sig`, and its `id` is a rumor id that resolves to nothing on any relay. If
 * such a value is ever allowed to flow through the same channel as a public
 * `NostrEvent`, it immediately reaches code that would mint a PUBLIC artifact
 * naming private content:
 *
 *   - `createEventIdentifier` / `naddr` encoding — there is no addressable
 *     coordinate for a rumor, so this fabricates a link to nothing;
 *   - `ShareEventDialog` — publishes a plaintext kind 1 quoting the event;
 *   - `useEventComments` — publishes a public kind 1111 whose `e` tag reveals
 *     both the rumor id and that a private event exists;
 *   - `useZap` — publishes a public zap request tagged to a nonexistent
 *     coordinate;
 *   - `cacheEvent` — persists decrypted content to IndexedDB.
 *
 * None of those are prevented by remembering to check a boolean. They are
 * prevented by making the private case a different shape, so a component that
 * has not handled `visibility` cannot compile against it.
 */
import type { NostrEvent } from "@nostrify/nostrify";

import type { Community } from "@/concord/lib/types";
import type { OpenedEvent } from "@/concord/lib/stream";
import type { CalendarEvent } from "./calendar";

/** A public NIP-52 event: a signed, addressable, shareable relay event. */
export interface PublicEventView {
  visibility: "public";
  event: NostrEvent;
}

/**
 * A private event: a calendar rumor inside a Concord stream.
 *
 * `community` carries the keys, so it must never be serialized into anything
 * user-visible or persisted anywhere but the encrypted key list.
 */
export interface PrivateEventView {
  visibility: "private";
  /** The parsed calendar rumor — the event itself. */
  calendar: CalendarEvent;
  /** The raw opened rumor, for callers that need tags or the author. */
  rumor: OpenedEvent;
  /** The community whose single channel holds this event. */
  community: Community;
}

export type PlektosEventView = PublicEventView | PrivateEventView;

/** Narrowing helper; prefer switching on `visibility` where you can. */
export function isPrivateView(view: PlektosEventView): view is PrivateEventView {
  return view.visibility === "private";
}

/**
 * Guard for anything that publishes a public artifact about an event.
 *
 * Call this at the top of a share / comment / zap / ICS-export path rather than
 * threading `visibility` through every component. It throws instead of
 * returning a boolean because every caller's correct response is "do not do
 * this", and a silently-ignored false is how leaks happen.
 */
export function assertPublishable(view: PlektosEventView, what: string): NostrEvent {
  if (view.visibility === "private") {
    throw new Error(
      `Refusing to ${what} for a private event: it would publish a plaintext ` +
        `reference to encrypted content.`,
    );
  }
  return view.event;
}
