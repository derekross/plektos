/**
 * Curated poster themes — complete vibes for the "Throw a party" flow.
 *
 * Where FEATURED_THEMES are bare color palettes, a poster preset is a whole
 * look: three core colors pre-paired with a marquee title face and an
 * ambient effect. One tap in the create flow sets all three.
 *
 * Like every theme, presets ride the standard Ditto tags when embedded on an
 * event, so they remain publishable as kind 36767 definitions.
 */
import type { ThemeConfig, ThemeDefinition } from "@/lib/themes";
import type { EventEffect } from "@/lib/effects";
import { posterTitleFont } from "@/lib/posterFonts";

export interface PosterPreset extends ThemeDefinition {
  /** Marquee face paired with this vibe (matches fonts[role=title]). */
  titleFont: string;
  /** Ambient effect paired with this vibe. */
  effect: EventEffect;
}

function preset(
  identifier: string,
  title: string,
  description: string,
  colors: ThemeConfig["colors"],
  titleFont: string,
  effect: EventEffect,
): PosterPreset {
  return {
    identifier,
    title,
    description,
    colors,
    fonts: [posterTitleFont(titleFont)],
    titleFont,
    effect,
  };
}

export const POSTER_PRESETS: PosterPreset[] = [
  preset(
    "oxblood",
    "Oxblood",
    "Wine-dark drama with editorial gravity",
    { background: "355 45% 7%", text: "20 25% 92%", primary: "355 85% 55%" },
    "Gloock",
    "sparkles",
  ),
  preset(
    "sakura",
    "Sakura",
    "Soft petal pink, elegant and airy",
    { background: "340 55% 96%", text: "335 40% 16%", primary: "335 80% 58%" },
    "Instrument Serif",
    "petals",
  ),
  preset(
    "disco-chrome",
    "Disco Chrome",
    "Mirror-ball silver and laser cyan",
    { background: "240 15% 9%", text: "220 15% 93%", primary: "195 95% 60%" },
    "Unbounded",
    "lasers",
  ),
  preset(
    "midnight-gold",
    "Midnight Gold",
    "Deep navy lit by candle gold",
    { background: "230 45% 7%", text: "45 40% 90%", primary: "42 95% 55%" },
    "Yeseva One",
    "sparkles",
  ),
  preset(
    "lime-rave",
    "Lime Rave",
    "Acid lime on blackout — all night long",
    { background: "0 0% 5%", text: "80 20% 90%", primary: "80 95% 55%" },
    "Pixelify Sans Variable",
    "confetti",
  ),
  preset(
    "bubblegum-pop",
    "Bubblegum Pop",
    "Sugar-rush pink and sky blue",
    { background: "320 70% 95%", text: "300 45% 18%", primary: "205 90% 55%" },
    "Caprasimo",
    "floating-emoji",
  ),
];

/** The full ThemeConfig a preset applies (colors + title font). */
export function presetThemeConfig(p: PosterPreset): ThemeConfig {
  return { colors: p.colors, fonts: p.fonts };
}
