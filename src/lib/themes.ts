/**
 * Ditto Theme System for Plektos
 *
 * Implements the Ditto theme specification:
 * - 3 core colors (background, text, primary) derive all 19 Tailwind CSS tokens
 * - Theme events: kind 36767 (definitions), kind 16767 (active profile theme)
 * - Themes can be embedded as tags on calendar events (kinds 31922/31923)
 *
 * Color format: HSL strings without wrapper, e.g. "228 20% 10%"
 * Nostr storage: hex in `c` tags, converted on read/write
 */

import type { NostrEvent } from "@nostrify/nostrify";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The 3 colors that define an entire theme. Values are HSL strings. */
export interface CoreThemeColors {
  /** Background color (e.g. "228 20% 10%") */
  background: string;
  /** Text/foreground color */
  text: string;
  /** Primary accent color (buttons, links, focus rings) */
  primary: string;
}

/** Font configuration for a theme. */
export interface ThemeFont {
  family: string;
  url?: string;
  role: "body" | "title";
}

/** Background image configuration. */
export interface ThemeBackground {
  url: string;
  mode: "cover" | "tile";
  mimeType?: string;
  dimensions?: string;
  blurhash?: string;
}

/** Complete theme configuration. */
export interface ThemeConfig {
  colors: CoreThemeColors;
  fonts?: ThemeFont[];
  background?: ThemeBackground;
}

/** A named, publishable theme definition. */
export interface ThemeDefinition extends ThemeConfig {
  identifier: string;
  title: string;
  description?: string;
  /** Author pubkey (set when parsed from a Nostr event) */
  pubkey?: string;
}

/** All 19 derived CSS custom property values (HSL strings). */
export interface DerivedTokens {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
}

// ---------------------------------------------------------------------------
// HSL / Hex conversion utilities
// ---------------------------------------------------------------------------

/** Parse an HSL string "H S% L%" into [h, s, l] numbers. */
export function parseHsl(hsl: string): [number, number, number] {
  const parts = hsl.trim().split(/\s+/);
  const h = parseFloat(parts[0]) || 0;
  const s = parseFloat(parts[1]) || 0;
  const l = parseFloat(parts[2]) || 0;
  return [h, s, l];
}

/** Format [h, s, l] back into an HSL string. */
export function formatHsl(h: number, s: number, l: number): string {
  return `${Math.round(h * 10) / 10} ${Math.round(s * 10) / 10}% ${Math.round(l * 10) / 10}%`;
}

/** Convert an HSL string to a hex color. */
export function hslStringToHex(hsl: string): string {
  const [h, s, l] = parseHsl(hsl);
  return hslToHex(h, s, l);
}

/** Convert h, s, l values to a hex string. */
function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }

  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Convert a hex color to an HSL string. */
export function hexToHslString(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  return formatHsl(h, s, l);
}

/** Convert a hex string to [h, s, l]. */
function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l * 100];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return [h * 360, s * 100, l * 100];
}

/** Get the luminance of an HSL string (0-100). */
function getLuminance(hsl: string): number {
  return parseHsl(hsl)[2];
}

// ---------------------------------------------------------------------------
// Token Derivation — 3 colors → 19 CSS tokens
// ---------------------------------------------------------------------------

/**
 * Derive all 19 Tailwind CSS theme tokens from 3 core colors.
 *
 * Determines light/dark mode from background luminance, then generates
 * all secondary colors algorithmically.
 */
export function deriveTokensFromCore(
  background: string,
  text: string,
  primary: string,
): DerivedTokens {
  const bgLum = getLuminance(background);
  const isDark = bgLum < 50;

  const [bgH, bgS, bgL] = parseHsl(background);
  const [priH, priS] = parseHsl(primary);

  // Card: slightly lighter than background in dark mode
  const cardL = isDark ? Math.min(bgL + 2, 100) : bgL;
  const card = formatHsl(bgH, bgS, cardL);

  // Secondary: shifted luminance from background
  const secL = isDark ? Math.min(bgL + 8, 100) : Math.max(bgL - 4, 0);
  const secondary = formatHsl(bgH, bgS, secL);

  // Muted: similar to secondary
  const mutedL = isDark ? Math.min(bgL + 8, 100) : Math.max(bgL - 4, 0);
  const muted = formatHsl(bgH, bgS, mutedL);

  // Muted foreground: desaturated mid-luminance
  const mutedFgL = isDark ? 55 : 46;
  const mutedForeground = formatHsl(bgH, Math.min(bgS, 16), mutedFgL);

  // Border: primary hue with reduced saturation
  const borderS = Math.min(priS, 25);
  const borderL = isDark ? Math.min(bgL + 15, 40) : Math.max(bgL - 10, 60);
  const border = formatHsl(priH, borderS, borderL);

  // Primary foreground: white or text based on contrast
  const priLum = getLuminance(primary);
  const primaryForeground = priLum > 60 ? "0 0% 0%" : "0 0% 100%";

  return {
    background,
    foreground: text,
    card,
    cardForeground: text,
    popover: card,
    popoverForeground: text,
    primary,
    primaryForeground,
    secondary,
    secondaryForeground: text,
    muted,
    mutedForeground,
    accent: primary,
    accentForeground: text,
    destructive: isDark ? "0 63% 31%" : "0 84.2% 60.2%",
    destructiveForeground: isDark ? "0 86% 97%" : "210 40% 98%",
    border,
    input: border,
    ring: primary,
  };
}

/** Map a camelCase token name to a CSS custom property name. */
export function tokenToCssVar(token: string): string {
  // cardForeground -> card-foreground
  return `--${token.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
}

/** Convert derived tokens into a CSS variable object for inline styles. */
export function tokensToCssVars(tokens: DerivedTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    vars[tokenToCssVar(key)] = value;
  }
  return vars;
}

// ---------------------------------------------------------------------------
// Parse / Build theme from Nostr event tags
// ---------------------------------------------------------------------------

/** Parse a ThemeConfig from Nostr event tags. Returns null if no theme tags found. */
export function parseThemeFromTags(tags: string[][]): ThemeConfig | null {
  const colorTags = tags.filter((t) => t[0] === "c" && t[2]);
  if (colorTags.length < 3) return null;

  const colors: Partial<CoreThemeColors> = {};
  for (const tag of colorTags) {
    const hex = tag[1];
    const role = tag[2];
    if (role === "background") colors.background = hexToHslString(hex);
    else if (role === "text") colors.text = hexToHslString(hex);
    else if (role === "primary") colors.primary = hexToHslString(hex);
  }

  if (!colors.background || !colors.text || !colors.primary) return null;

  const config: ThemeConfig = {
    colors: colors as CoreThemeColors,
  };

  // Parse fonts
  const fontTags = tags.filter((t) => t[0] === "f" && t[1]);
  if (fontTags.length > 0) {
    config.fonts = fontTags.map((t) => ({
      family: t[1],
      url: t[2] || undefined,
      role: (t[3] as "body" | "title") || "body",
    }));
  }

  // Parse background
  const bgTag = tags.find((t) => t[0] === "bg");
  if (bgTag) {
    const parts: Record<string, string> = {};
    for (let i = 1; i < bgTag.length; i++) {
      const part = bgTag[i];
      const spaceIdx = part.indexOf(" ");
      if (spaceIdx > 0) {
        parts[part.substring(0, spaceIdx)] = part.substring(spaceIdx + 1);
      }
    }
    if (parts.url) {
      config.background = {
        url: parts.url,
        mode: (parts.mode as "cover" | "tile") || "cover",
        mimeType: parts.m,
        dimensions: parts.dim,
        blurhash: parts.blurhash,
      };
    }
  }

  return config;
}

/** Parse a ThemeDefinition from a kind 36767 event. */
export function parseThemeDefinition(event: NostrEvent): ThemeDefinition | null {
  const config = parseThemeFromTags(event.tags);
  if (!config) return null;

  const identifier = event.tags.find((t) => t[0] === "d")?.[1];
  const title = event.tags.find((t) => t[0] === "title")?.[1];
  if (!identifier || !title) return null;

  const description = event.tags.find((t) => t[0] === "description")?.[1];

  return {
    ...config,
    identifier,
    title,
    description,
    pubkey: event.pubkey,
  };
}

/** Build Nostr event tags from a ThemeConfig. */
export function buildThemeTags(config: ThemeConfig): string[][] {
  const tags: string[][] = [
    ["c", hslStringToHex(config.colors.background), "background"],
    ["c", hslStringToHex(config.colors.text), "text"],
    ["c", hslStringToHex(config.colors.primary), "primary"],
  ];

  if (config.fonts) {
    for (const font of config.fonts) {
      tags.push(["f", font.family, font.url || "", font.role]);
    }
  }

  if (config.background) {
    const bgParts = [`url ${config.background.url}`, `mode ${config.background.mode}`];
    if (config.background.mimeType) bgParts.push(`m ${config.background.mimeType}`);
    if (config.background.dimensions) bgParts.push(`dim ${config.background.dimensions}`);
    if (config.background.blurhash) bgParts.push(`blurhash ${config.background.blurhash}`);
    tags.push(["bg", ...bgParts]);
  }

  return tags;
}

/** Build tags for a kind 36767 theme definition event. */
export function buildThemeDefinitionTags(
  identifier: string,
  title: string,
  config: ThemeConfig,
  description?: string,
): string[][] {
  const tags = [
    ["d", identifier],
    ...buildThemeTags(config),
    ["title", title],
    ["alt", `Custom theme: ${title}`],
    ["t", "theme"],
  ];
  if (description) tags.push(["description", description]);
  return tags;
}

/** Build tags for a kind 16767 active profile theme event. */
export function buildActiveThemeTags(
  config: ThemeConfig,
  sourceAuthor?: string,
  sourceIdentifier?: string,
): string[][] {
  const tags = [
    ...buildThemeTags(config),
    ["alt", "Active profile theme"],
  ];
  if (sourceAuthor && sourceIdentifier) {
    tags.push(["a", `36767:${sourceAuthor}:${sourceIdentifier}`]);
  }
  return tags;
}

// ---------------------------------------------------------------------------
// Featured Theme Presets
// ---------------------------------------------------------------------------

export const FEATURED_THEMES: ThemeDefinition[] = [
  {
    identifier: "purple-haze",
    title: "Purple Haze",
    description: "The default Plektos vibe — vivid purple on dark indigo",
    colors: {
      background: "260 60% 6%",
      text: "260 20% 92%",
      primary: "280 100% 70%",
    },
  },
  {
    identifier: "midnight-galaxy",
    title: "Midnight Galaxy",
    description: "Deep space blues with electric violet accents",
    colors: {
      background: "228 40% 8%",
      text: "220 20% 93%",
      primary: "258 80% 62%",
    },
  },
  {
    identifier: "sunset-gathering",
    title: "Sunset Gathering",
    description: "Warm amber tones for golden hour events",
    colors: {
      background: "30 50% 6%",
      text: "35 30% 90%",
      primary: "25 95% 58%",
    },
  },
  {
    identifier: "ocean-calm",
    title: "Ocean Calm",
    description: "Serene teals and aqua for relaxed gatherings",
    colors: {
      background: "195 50% 7%",
      text: "190 20% 92%",
      primary: "175 70% 48%",
    },
  },
  {
    identifier: "neon-underground",
    title: "Neon Underground",
    description: "Cyberpunk greens on pure black",
    colors: {
      background: "0 0% 4%",
      text: "120 10% 88%",
      primary: "145 100% 50%",
    },
  },
  {
    identifier: "rose-garden",
    title: "Rose Garden",
    description: "Soft pinks and warm whites for elegant events",
    colors: {
      background: "340 25% 96%",
      text: "340 30% 15%",
      primary: "340 82% 55%",
    },
  },
  {
    identifier: "retro-arcade",
    title: "Retro Arcade",
    description: "Hot magenta on dark navy — 80s arcade nostalgia",
    colors: {
      background: "240 40% 8%",
      text: "60 20% 90%",
      primary: "320 100% 60%",
    },
  },
  {
    identifier: "forest-bonfire",
    title: "Forest Bonfire",
    description: "Earthy greens lit by warm firelight",
    colors: {
      background: "150 30% 6%",
      text: "90 15% 88%",
      primary: "35 90% 52%",
    },
  },
  {
    identifier: "clean-light",
    title: "Clean Light",
    description: "Minimal white with blue accents — classic and crisp",
    colors: {
      background: "0 0% 99%",
      text: "220 30% 12%",
      primary: "220 85% 55%",
    },
  },
  {
    identifier: "golden-hour",
    title: "Golden Hour",
    description: "Cream canvas with rich gold highlights",
    colors: {
      background: "45 40% 95%",
      text: "40 40% 15%",
      primary: "42 95% 48%",
    },
  },
];
