import type { NostrEvent } from "./rumor";

interface RelayPublisher {
  relay(url: string): {
    event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void>;
  };
}

/**
 * Publish to every relay, but resolve as soon as ONE accepts.
 *
 * The alternative — `Promise.allSettled` — makes every publish as slow as the
 * community's deadest relay, because it can't report success until the losers
 * have finished timing out (8s). The remaining attempts continue in the
 * background either way, so nothing is delivered less widely; the caller just
 * stops waiting on relays whose answer can no longer change the outcome.
 */
export async function publishToAnyRelay(
  nostr: RelayPublisher,
  relays: string[],
  event: NostrEvent,
  errorMessage: string,
): Promise<void> {
  try {
    await Promise.any(
      relays.map((url) => nostr.relay(url).event(event, { signal: AbortSignal.timeout(8000) })),
    );
  } catch (error) {
    // Keep the per-relay AggregateError reachable for debugging.
    throw new Error(errorMessage, { cause: error });
  }
}
