import { NostrContext } from "@nostrify/react";
import { NPool, NRelay1, NostrEvent } from "@nostrify/nostrify";
import { getEventHash, verifyEvent } from "nostr-tools/pure";
import React, { useEffect, useRef } from "react";

interface NostrProviderProps {
  children: React.ReactNode;
  relays: string[];
}

export default function NostrProvider({
  children,
  relays,
}: NostrProviderProps) {
  // Create NPool instance only once
  const pool = useRef<NPool | undefined>(undefined);

  // Use refs so the pool always has the latest data
  const relayUrls = useRef<string[]>(relays);

  // Update refs when relays change
  useEffect(() => {
    relayUrls.current = relays;
  }, [relays]);

  // Initialize NPool only once
  if (!pool.current) {
    pool.current = new NPool({
      open(url: string) {
        return new NRelay1(url, {
          /**
           * Concord wraps (1059/21059) are signed by a group-shared or
           * ephemeral key, so the OUTER signature proves nothing about
           * authorship — real authorship is proven one layer in, by the seal's
           * signature, which `openWrap` verifies. Checking Schnorr here is pure
           * wasted work, and a private event's history is fetched by the
           * hundred on a phone.
           *
           * The id hash is still verified: it is what we dedupe and index on,
           * so it must actually match the event's contents. Only the redundant
           * signature check is skipped. Everything else verifies in full.
           */
          verifyEvent: (event: NostrEvent): boolean =>
            event.kind === 1059 || event.kind === 21059
              ? event.id === getEventHash(event)
              : verifyEvent(event),
        });
      },
      reqRouter(filters) {
        // Query ALL relays for maximum data coverage
        const filterMap = new Map();
        relayUrls.current.forEach(url => {
          filterMap.set(url, filters);
        });
        return filterMap;
      },
      eventRouter(_event: NostrEvent) {
        // Publish to ALL configured relays for better distribution
        return relayUrls.current;
      },
    });
  }

  return (
    <NostrContext.Provider value={{ nostr: pool.current }}>
      {children}
    </NostrContext.Provider>
  );
}
