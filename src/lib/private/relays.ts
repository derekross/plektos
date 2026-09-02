/**
 * Relays for private events.
 *
 * A Concord stream is read with `{kinds:[1059], authors:[<stream pk>]}`. That
 * shape matters: Concord REVERSES NIP-59, so the wrap's `p` tag is a random
 * ephemeral key nobody controls and the query is by author, not by `#p`. Any
 * relay that gates gift-wrap reads on `#p == <authed pubkey>` — a common DM
 * policy — returns nothing here. Forever. Silently.
 *
 * So the set below is not a guess. Each was probed by publishing a kind-1059
 * with a random `p` tag, disconnecting, waiting, and reading it back by
 * `authors` on a FRESH connection (a same-connection read only proves the
 * relay echoed your own event, not that it stored it):
 *
 *   relay.ditto.pub          PASS
 *   jskitty.com/nostr        PASS
 *   relay.dreamith.to        PASS
 *   relay.damus.io           PASS  (already in the app's set)
 *   relay.primal.net         PASS  (already in the app's set)
 *   nos.lol                  FAIL  auth-gated, and its AUTH is broken
 *                                  server-side: "relay needs serviceUrl to be
 *                                  configured before AUTH can work"
 *   asia.vectorapp.io/nostr  FAIL  same failure, same message
 *   nostr-relay.derekross.me FAIL  rejects the write: owner-signed notes only
 *
 * nos.lol stays in the app's global set for public events; it will simply never
 * carry a private one.
 */

/** Relays known to store AND serve `{kinds:[1059], authors:[…]}`. */
export const PRIVATE_EVENT_RELAYS = [
  "wss://relay.ditto.pub",
  "wss://jskitty.com/nostr",
  "wss://relay.dreamith.to",
  "wss://relay.damus.io",
  "wss://relay.primal.net",
] as const;

/**
 * The relays a private event is published to and read from.
 *
 * `community.relays` (the event's own set, from its control-plane metadata)
 * comes first, unioned with the app set as a fallback for a joiner whose
 * invite-fragment relays have gone stale.
 *
 * NEVER write the result of this back into a community's own relay list. A
 * relay holding none of that community's wraps answers every request with an
 * instant empty EOSE, wins the page race during a backfill, and starves the
 * relays that actually have the data (Armada issue #19). Union at QUERY time
 * only.
 */
export function resolvePrivateRelays(communityRelays?: readonly string[]): string[] {
  const out: string[] = [];
  for (const url of [...(communityRelays ?? []), ...PRIVATE_EVENT_RELAYS]) {
    if (!out.includes(url)) out.push(url);
  }
  return out;
}
