/**
 * The marquee font set — curated poster title faces for the Living Poster.
 *
 * All fonts are self-hosted via Fontsource (no Google Fonts CDN — privacy
 * matters for a Nostr app). Each face is its own lazy chunk, loaded on
 * demand when a host previews it or a guest views an event that uses it.
 *
 * The chosen face travels as a Ditto `ThemeFont` (role "title") inside the
 * event's embedded theme tags, so the vibe follows the event across clients;
 * clients without the font fall back down the `font-title` stack.
 */
import type { ThemeFont } from "@/lib/themes";

export interface PosterFont {
  /** CSS font-family exactly as registered by the Fontsource package. */
  family: string;
  /** Short vibe label shown under the name in the picker. */
  vibe: string;
  /** Imports the font's CSS (and woff2) as a lazy chunk. */
  load: () => Promise<unknown>;
}

export const POSTER_FONTS: PosterFont[] = [
  {
    family: "Unbounded",
    vibe: "Y2K chrome",
    load: () => import("@fontsource/unbounded/700.css"),
  },
  {
    family: "Instrument Serif",
    vibe: "elegant",
    load: () => import("@fontsource/instrument-serif"),
  },
  {
    family: "Caprasimo",
    vibe: "goofy chunky",
    load: () => import("@fontsource/caprasimo"),
  },
  {
    family: "Yeseva One",
    vibe: "romantic",
    load: () => import("@fontsource/yeseva-one"),
  },
  {
    family: "Space Grotesk Variable",
    vibe: "techy",
    load: () => import("@fontsource-variable/space-grotesk"),
  },
  {
    family: "Shrikhand",
    vibe: "loud",
    load: () => import("@fontsource/shrikhand"),
  },
  {
    family: "Pixelify Sans Variable",
    vibe: "retro-game",
    load: () => import("@fontsource-variable/pixelify-sans"),
  },
  {
    family: "Gloock",
    vibe: "editorial",
    load: () => import("@fontsource/gloock"),
  },
];

export function isPosterFontFamily(family: string): boolean {
  return POSTER_FONTS.some((f) => f.family === family);
}

/** Build the ThemeFont entry that embeds this face on an event's theme. */
export function posterTitleFont(family: string): ThemeFont {
  return { family, role: "title" };
}

const loadedFamilies = new Set<string>();

/**
 * Load a marquee face once. Unknown families resolve immediately — themes
 * from other clients may name fonts we don't ship, and the CSS fallback
 * stack handles those.
 */
export async function loadPosterFont(family: string): Promise<void> {
  const font = POSTER_FONTS.find((f) => f.family === family);
  if (!font || loadedFamilies.has(family)) return;
  loadedFamilies.add(family);
  try {
    await font.load();
  } catch {
    // Chunk fetch failed (offline, etc.) — allow a retry on next call.
    loadedFamilies.delete(family);
  }
}

/** Load every marquee face — used by the font carousel so each pill renders in its own face. */
export function loadAllPosterFonts(): void {
  for (const font of POSTER_FONTS) {
    void loadPosterFont(font.family);
  }
}
