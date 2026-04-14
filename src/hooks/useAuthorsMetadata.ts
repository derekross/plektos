import { useMemo, useEffect, useState } from 'react';
import { type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { getCachedProfiles, cacheProfiles } from '@/lib/indexedDB';

const BATCH_SIZE = 100;

export function useAuthorsMetadata(pubkeys: string[]) {
  const { nostr } = useNostr();
  const [cachedData, setCachedData] = useState<Record<string, NostrMetadata> | undefined>(undefined);

  // Create stable query key by sorting a copy and joining
  const sortedKeyString = useMemo(
    () => [...pubkeys].sort().join(','),
    [pubkeys]
  );

  // Load cached profiles on mount (instant)
  useEffect(() => {
    async function loadCache() {
      if (pubkeys.length === 0) return;

      try {
        const cached = await getCachedProfiles(pubkeys);
        if (cached.size > 0) {
          const metadataMap: Record<string, NostrMetadata> = {};
          for (const [pubkey, profile] of cached) {
            metadataMap[pubkey] = profile.metadata as NostrMetadata;
          }
          setCachedData(metadataMap);
        }
      } catch {
        // Cache read failed, continue without cache
      }
    }
    loadCache();
  }, [sortedKeyString]); // eslint-disable-line react-hooks/exhaustive-deps -- sortedKeyString is derived from pubkeys

  return useQuery<Record<string, NostrMetadata>>({
    queryKey: ['authors-metadata', sortedKeyString],
    queryFn: async ({ signal }) => {
      if (pubkeys.length === 0) {
        return {};
      }

      const metadataMap: Record<string, NostrMetadata> = {};
      const timeoutSignal = AbortSignal.timeout(3000);
      const combinedSignal = AbortSignal.any([signal, timeoutSignal]);

      // Batch pubkeys into chunks to avoid relay limits
      const batches: string[][] = [];
      for (let i = 0; i < pubkeys.length; i += BATCH_SIZE) {
        batches.push(pubkeys.slice(i, i + BATCH_SIZE));
      }

      // Query all batches in parallel
      const results = await Promise.all(
        batches.map(batch =>
          nostr.query(
            [{ kinds: [0], authors: batch, limit: batch.length }],
            { signal: combinedSignal }
          ).catch(() => [])
        )
      );

      // Collect profiles to cache
      const profilesToCache: Array<{ pubkey: string; event: typeof results[0][0]; metadata: NostrMetadata }> = [];

      // Combine results from all batches
      for (const events of results) {
        for (const event of events) {
          try {
            const metadata = n.json().pipe(n.metadata()).parse(event.content);
            metadataMap[event.pubkey] = metadata;
            profilesToCache.push({ pubkey: event.pubkey, event, metadata });
          } catch {
            // If parsing fails, skip this metadata
          }
        }
      }

      // Cache profiles in background (non-blocking)
      if (profilesToCache.length > 0) {
        cacheProfiles(profilesToCache).catch(() => {});
      }

      return metadataMap;
    },
    // Use cached data as placeholder for instant display
    placeholderData: cachedData,
    retry: 2,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled: pubkeys.length > 0,
  });
}
