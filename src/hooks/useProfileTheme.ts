import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { parseThemeFromTags } from "@/lib/themes";

/**
 * Query the active profile theme (kind 16767) for a given pubkey.
 * Returns the ThemeConfig if the user has an active theme, null otherwise.
 */
export function useProfileTheme(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ["profileTheme", pubkey],
    queryFn: async (c) => {
      if (!pubkey) return null;

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);

      const events = await nostr.query(
        [{ kinds: [16767], authors: [pubkey], limit: 1 }],
        { signal },
      );

      if (events.length === 0) return null;

      // Use the most recent event
      const sorted = [...events].sort((a, b) => b.created_at - a.created_at);
      return parseThemeFromTags(sorted[0].tags);
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Query a user's published theme definitions (kind 36767).
 */
export function useUserThemes(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ["userThemes", pubkey],
    queryFn: async (c) => {
      if (!pubkey) return [];

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);

      const events = await nostr.query(
        [{ kinds: [36767], authors: [pubkey], limit: 50 }],
        { signal },
      );

      return events;
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
  });
}
