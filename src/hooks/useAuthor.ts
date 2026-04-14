import { useEffect, useState } from 'react';
import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { getCachedProfile, cacheProfile } from '@/lib/indexedDB';

export function useAuthor(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const [cachedData, setCachedData] = useState<{ event?: NostrEvent; metadata?: NostrMetadata } | undefined>(undefined);

  // Load cached profile on mount (instant)
  useEffect(() => {
    async function loadCache() {
      if (!pubkey) return;

      try {
        const cached = await getCachedProfile(pubkey);
        if (cached) {
          setCachedData({
            event: cached.event,
            metadata: cached.metadata as NostrMetadata,
          });
        }
      } catch {
        // Cache read failed, continue without cache
      }
    }
    loadCache();
  }, [pubkey]);

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey: ['author', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!pubkey) {
        return {};
      }

      const [event] = await nostr.query(
        [{ kinds: [0], authors: [pubkey], limit: 1 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) },
      );

      if (!event) {
        return {};
      }

      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);

        // Cache profile in background (non-blocking)
        cacheProfile(pubkey, event, metadata).catch(() => {});

        return { metadata, event };
      } catch {
        return { event };
      }
    },
    // Use cached data as placeholder for instant display
    placeholderData: cachedData,
    retry: 1,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
