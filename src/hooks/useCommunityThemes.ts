import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { parseThemeDefinition, type ThemeDefinition } from "@/lib/themes";

/**
 * Query kind 36767 theme definition events from relays.
 * Returns community-published themes with the "theme" topic tag.
 */
export function useCommunityThemes(limit = 50) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ["communityThemes", limit],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);

      const events = await nostr.query(
        [{ kinds: [36767], "#t": ["theme"], limit }],
        { signal },
      );

      const themes: ThemeDefinition[] = [];
      for (const event of events) {
        const def = parseThemeDefinition(event);
        if (def) themes.push(def);
      }

      // Sort by most recent first
      return themes;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
