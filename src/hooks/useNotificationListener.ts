import { useMemo, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNotifications } from '@/contexts/NotificationContext';
import type { Notification } from '@/lib/notificationTypes';
import type { NostrEvent } from '@nostrify/nostrify';
import { useQuery } from '@tanstack/react-query';

export function useNotificationListener() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { addNotification } = useNotifications();
  const processedEventsRef = useRef(new Set<string>());

  // Get user's events to know what to listen for
  const { data: userEvents = [] } = useQuery({
    queryKey: ['userEvents', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey) return [];
      
      const events = await nostr.query(
        [{ 
          kinds: [31922, 31923], // Date-based and time-based events
          authors: [user.pubkey],
          limit: 100 
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) }
      );
      
      return events;
    },
    enabled: !!user?.pubkey,
    staleTime: 60000, // Cache for 1 minute
  });

  // Process a Nostr event and create notification if appropriate
  const processEvent = async (event: NostrEvent) => {
    // Skip if we've already processed this event
    if (processedEventsRef.current.has(event.id)) {
      return;
    }
    // Cap the dedup set so it doesn't grow unbounded over a long session
    if (processedEventsRef.current.size >= 5000) {
      processedEventsRef.current.clear();
    }
    processedEventsRef.current.add(event.id);

    // Skip events from the user themselves
    if (event.pubkey === user?.pubkey) {
      return;
    }

    // Skip events that are too old (older than 1 hour)
    const oneHourAgo = Math.floor(Date.now() / 1000) - (60 * 60);
    if (event.created_at < oneHourAgo) {
      return;
    }

    try {
      let notification: Notification | null = null;

      if (event.kind === 31925) {
        // RSVP notification
        const eventTag = event.tags.find(tag => tag[0] === 'e');
        const statusTag = event.tags.find(tag => tag[0] === 'status');
        
        if (eventTag && statusTag) {
          const eventId = eventTag[1];
          const status = statusTag[1] as 'accepted' | 'declined' | 'tentative';
          const userEvent = userEvents.find(e => e.id === eventId);
          
          if (userEvent) {
            const eventTitle = userEvent.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled Event';

            notification = {
              id: event.id,
              type: 'rsvp',
              timestamp: event.created_at * 1000,
              read: false,
              eventId,
              eventTitle,
              fromPubkey: event.pubkey,
              status,
            };
          }
        }
      } else if (event.kind === 1111) {
        // Comment notification
        const eventTag = event.tags.find(tag => tag[0] === 'e');
        
        if (eventTag) {
          const eventId = eventTag[1];
          const userEvent = userEvents.find(e => e.id === eventId);
          
          if (userEvent) {
            const eventTitle = userEvent.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled Event';

            notification = {
              id: event.id,
              type: 'comment',
              timestamp: event.created_at * 1000,
              read: false,
              eventId,
              eventTitle,
              fromPubkey: event.pubkey,
              commentContent: event.content,
              commentId: event.id,
            };
          }
        }
      } else if (event.kind === 9735) {
        // Zap notification
        const eventTag = event.tags.find(tag => tag[0] === 'e');
        const descriptionTag = event.tags.find(tag => tag[0] === 'description');
        
        if (eventTag && descriptionTag) {
          try {
            const zapRequest = JSON.parse(descriptionTag[1]);
            const amountTag = zapRequest.tags?.find((tag: string[]) => tag[0] === 'amount');
            
            if (amountTag) {
              const eventId = eventTag[1];
              const userEvent = userEvents.find(e => e.id === eventId);
              
              if (userEvent) {
                const amountMsats = parseInt(amountTag[1]);
                const amount = Math.floor(amountMsats / 1000); // Convert to sats
                const eventTitle = userEvent.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled Event';

                notification = {
                  id: event.id,
                  type: 'zap',
                  timestamp: event.created_at * 1000,
                  read: false,
                  eventId,
                  eventTitle,
                  fromPubkey: event.pubkey,
                  amount,
                  comment: zapRequest.content || undefined,
                };
              }
            }
          } catch (error) {
            console.error('Failed to parse zap request:', error);
          }
        }
      }

      if (notification) {
        addNotification(notification);
      }
    } catch (error) {
      console.error('Error processing notification event:', error);
    }
  };

  // Stable primitive key — using the userEvents array object would churn the
  // query key (and refetch) every time the upstream query re-resolves
  const userEventIdsKey = useMemo(
    () => userEvents.map((event) => event.id).sort().join(','),
    [userEvents]
  );

  // Fetch recent notifications for user events
  useQuery({
    queryKey: ['recentNotifications', user?.pubkey, userEventIdsKey],
    queryFn: async ({ signal }) => {
      if (!user?.pubkey || !userEvents.length) return [];

      const userEventIds = userEvents.map(event => event.id);
      const since = Math.floor(Date.now() / 1000) - (24 * 60 * 60); // Last 24 hours

      const filters = [
        // RSVPs to user's events
        {
          kinds: [31925],
          "#e": userEventIds,
          since,
          limit: 100,
        },
        // Comments on user's events
        {
          kinds: [1111],
          "#e": userEventIds,
          since,
          limit: 100,
        },
        // Zaps to user's events
        {
          kinds: [9735],
          "#e": userEventIds,
          since,
          limit: 100,
        },
      ];

      const events = await nostr.query(
        filters,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) }
      );

      // Process all events
      for (const event of events) {
        await processEvent(event);
      }
      
      return events;
    },
    enabled: !!user?.pubkey && !!userEvents.length,
    staleTime: 30000, // Cache for 30 seconds
    refetchInterval: 60000, // Refetch every minute for real-time updates
  });
}