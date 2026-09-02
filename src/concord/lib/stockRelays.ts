/**
 * The CORD-05 stock relay dictionary.
 *
 * Split out of `invite.ts` (which re-exports both names) so plain-data
 * consumers — the app config's community-relay default, the landing page's
 * relay lights — can read the set without pulling the fragment codec and its
 * crypto dependencies into their chunk. There is exactly one definition; edit
 * it here.
 */

/**
 * The stock relay dictionary, generation 4: four primaries every client knows,
 * referenced by a single byte. Versioned — it grows without breaking older
 * links; both Vector and Soapbox ship it identically.
 */
export const RELAY_DICTIONARY: Record<number, string> = {
  1: "wss://jskitty.com/nostr",
  2: "wss://asia.vectorapp.io/nostr",
  3: "wss://relay.ditto.pub",
  4: "wss://relay.dreamith.to",
};

/** The stock set selected by the flags bit (dictionary ids 1–4, in order). */
export const STOCK_RELAYS: string[] = [1, 2, 3, 4].map((i) => RELAY_DICTIONARY[i]);
