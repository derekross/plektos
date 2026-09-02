/**
 * The unsigned-rumor shape the stream layer operates on.
 *
 * Carved from Armada's `src/lib/nostrRumor.ts`, with the `NostrEvent` type
 * taken from nostr-tools rather than Nostrify — this package deliberately has
 * no Nostrify dependency, so a host on any Nostrify version (or none) can
 * consume it.
 */
import type { NostrEvent } from "nostr-tools/pure";

export type { NostrEvent };

/** An unsigned rumor: a NostrEvent shape with an id but no signature. */
export type NostrRumor = Omit<NostrEvent, "sig">;

/**
 * Whether a rumor still carries its signature, narrowing it to a full
 * `NostrEvent`. Anything that re-publishes an event verbatim needs this — an
 * unsigned copy is rejected by every relay.
 */
export function isSigned(rumor: NostrRumor): rumor is NostrEvent {
  const sig = (rumor as Partial<NostrEvent>).sig;
  return typeof sig === "string" && sig.length > 0;
}
