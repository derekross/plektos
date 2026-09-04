import { useNostr } from "@nostrify/react";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";

import { useCurrentUser } from "./useCurrentUser";

import type { NostrEvent } from "@nostrify/nostrify";
import type { DateBasedEvent, TimeBasedEvent } from "@/lib/eventTypes";

export function useNostrPublish(): UseMutationResult<NostrEvent> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (t: Omit<NostrEvent, "id" | "pubkey" | "sig">) => {
      if (user) {
        const tags = t.tags ?? [];

        // Add the client tag if it doesn't exist
        if (!tags.some((tag) => tag[0] === "client")) {
          tags.push(["client", "Plektos"]);
        }

        const event = await user.signer.signEvent({
          kind: t.kind,
          content: t.content ?? "",
          tags,
          created_at: t.created_at ?? Math.floor(Date.now() / 1000),
        });

        await nostr.event(event, { signal: AbortSignal.timeout(5000) });
        return event;
      } else {
        throw new Error("User is not logged in");
      }
    },
    onError: (error) => {
      console.error("Failed to publish event:", error);
    },
    onSuccess: (data) => {
      
      // If this is a calendar event (kind 31922 or 31923), update the events cache for immediate feedback
      if (data.kind === 31922 || data.kind === 31923) {
        const typedEvent = data as unknown as DateBasedEvent | TimeBasedEvent;
        
        // Get all events query keys that might need updating
        const eventsQueryKeys = [
          ["events"], // Base events query
        ];
        
        // Update each events query in the cache
        eventsQueryKeys.forEach(queryKey => {
          queryClient.setQueriesData(
            { queryKey, exact: false },
            (oldData: (DateBasedEvent | TimeBasedEvent)[] | undefined) => {
              if (!oldData) return [typedEvent];
              
              // Check if this event already exists (by coordinate for replaceable events)
              const dTag = typedEvent.tags.find(tag => tag[0] === 'd')?.[1];
              if (dTag) {
                const existingIndex = oldData.findIndex(event => {
                  const existingDTag = event.tags.find(tag => tag[0] === 'd')?.[1];
                  return existingDTag === dTag && 
                         event.kind === typedEvent.kind && 
                         event.pubkey === typedEvent.pubkey;
                });
                
                if (existingIndex >= 0) {
                  // Replace existing event
                  const newData = [...oldData];
                  newData[existingIndex] = typedEvent;
                  return newData;
                } else {
                  // Add new event to the beginning of the list
                  return [typedEvent, ...oldData];
                }
              } else {
                // For events without d tag, just add to the beginning
                return [typedEvent, ...oldData];
              }
            }
          );
        });
        
        // Also invalidate the queries to ensure fresh data from relays
        queryClient.invalidateQueries({ 
          queryKey: ["events"],
          exact: false 
        });
      }
    },
  });
}
