import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { NRelay1, type NostrEvent } from "@nostrify/nostrify";

import { useCurrentUser } from "./useCurrentUser";
import { useUserRelays } from "./useUserRelays";

// Default bootstrap relays that the application uses
const BOOTSTRAP_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net", 
  "wss://nos.lol",
  "wss://relay.ditto.pub",
];

export function useEnhancedNostrPublish(): UseMutationResult<NostrEvent> {
  const { user } = useCurrentUser();
  const { data: userRelays = [] } = useUserRelays();

  return useMutation({
    mutationFn: async (t: Omit<NostrEvent, "id" | "pubkey" | "sig">) => {
      if (!user) {
        throw new Error("User is not logged in");
      }

      const tags = t.tags ?? [];

      // Add the client tag if it doesn't exist
      if (!tags.some((tag) => tag[0] === "client")) {
        tags.push(["client", "Plektos"]);
      }

      // Sign the event
      const event = await user.signer.signEvent({
        kind: t.kind,
        content: t.content ?? "",
        tags,
        created_at: t.created_at ?? Math.floor(Date.now() / 1000),
      });

      // Combine user relays with bootstrap relays, removing duplicates
      const allRelays = [...new Set([...userRelays, ...BOOTSTRAP_RELAYS])];
      
      // Publish to relays individually to handle failures gracefully
      const publishResults = await Promise.allSettled(
        allRelays.map(async (relay) => {
          const singleRelay = new NRelay1(relay);
          
          try {
            // Publish the event with a timeout for both connection and publishing
            await singleRelay.event(event, { signal: AbortSignal.timeout(8000) });
            singleRelay.close();
            
            return { relay, status: 'success' };
          } catch (error) {
            singleRelay.close();
            // Don't log individual relay failures as errors since some may be expected
            return { relay, status: 'failed', error: error instanceof Error ? error.message : String(error) };
          }
        })
      );

      const successfulPublishes = publishResults.filter(result => 
        result.status === 'fulfilled' && result.value.status === 'success'
      );
      
      const failedPublishes = publishResults.filter(result => 
        result.status === 'rejected' || 
        (result.status === 'fulfilled' && result.value.status === 'failed')
      );

      // Only log failed relays in debug mode to reduce console noise
      if (failedPublishes.length > 0) {
        console.debug("Some relays failed to publish:", 
          failedPublishes.map(r => {
            if (r.status === 'rejected') return r.reason;
            if (r.status === 'fulfilled') return `${r.value.relay}: ${r.value.error}`;
            return r;
          })
        );
      }

      // As long as we successfully published to at least one relay, consider it a success
      if (successfulPublishes.length === 0) {
        throw new Error(`Failed to publish to any relays. Attempted ${allRelays.length} relays.`);
      }

      return event;
    },
    onError: () => {
      // Error handling is done by the caller
    },
  });
}