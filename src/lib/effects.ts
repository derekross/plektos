/**
 * Ambient event effects — the animated layer of the Living Poster.
 *
 * The host's effect choice is stored as an `fx` tag on calendar events
 * (kinds 31922/31923), alongside the embedded Ditto theme tags. Other
 * Nostr clients simply ignore the tag, so events degrade gracefully.
 */

export const EVENT_EFFECTS = [
  "confetti",
  "floating-emoji",
  "sparkles",
  "petals",
  "lasers",
] as const;

export type EventEffect = (typeof EVENT_EFFECTS)[number];

export function isEventEffect(value: string): value is EventEffect {
  return (EVENT_EFFECTS as readonly string[]).includes(value);
}

/** Read the ambient effect from an event's tags. Null when absent or unknown. */
export function parseEffectFromTags(tags: string[][]): EventEffect | null {
  const value = tags.find((t) => t[0] === "fx")?.[1];
  return value && isEventEffect(value) ? value : null;
}

/** Build the `fx` tag for a calendar event. */
export function buildEffectTag(effect: EventEffect): string[] {
  return ["fx", effect];
}
