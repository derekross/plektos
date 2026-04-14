import { useMemo } from "react";
import { parseThemeFromTags, type ThemeConfig } from "@/lib/themes";

/**
 * Extract a Ditto theme from an event's tags.
 * Returns the ThemeConfig if the event has valid c tags, null otherwise.
 */
export function useEventTheme(
  event: { tags: string[][] } | null | undefined,
): ThemeConfig | null {
  return useMemo(() => {
    if (!event?.tags) return null;
    return parseThemeFromTags(event.tags);
  }, [event?.tags]);
}
