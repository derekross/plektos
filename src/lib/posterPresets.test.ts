import { describe, it, expect } from "vitest";
import { POSTER_PRESETS, presetThemeConfig } from "./posterPresets";
import { POSTER_FONTS, isPosterFontFamily } from "./posterFonts";
import { EVENT_EFFECTS } from "./effects";
import { contrastRatio, deriveTokensFromCore, parseHsl } from "./themes";

describe("POSTER_PRESETS", () => {
  it("has unique identifiers", () => {
    const ids = POSTER_PRESETS.map((p) => p.identifier);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses valid HSL color strings", () => {
    for (const p of POSTER_PRESETS) {
      for (const color of Object.values(p.colors)) {
        const [h, s, l] = parseHsl(color);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(360);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
        expect(l).toBeGreaterThanOrEqual(0);
        expect(l).toBeLessThanOrEqual(100);
      }
    }
  });

  it("pairs every preset with a shipped marquee face", () => {
    for (const p of POSTER_PRESETS) {
      expect(isPosterFontFamily(p.titleFont)).toBe(true);
    }
  });

  it("keeps titleFont and the embedded fonts array in sync", () => {
    for (const p of POSTER_PRESETS) {
      const titleEntry = p.fonts?.find((f) => f.role === "title");
      expect(titleEntry?.family).toBe(p.titleFont);
    }
  });

  it("uses a valid ambient effect", () => {
    for (const p of POSTER_PRESETS) {
      expect(EVENT_EFFECTS).toContain(p.effect);
    }
  });

  it("derives WCAG AA readable foregrounds (the phase-2 clamp contract)", () => {
    for (const p of POSTER_PRESETS) {
      const tokens = deriveTokensFromCore(
        p.colors.background,
        p.colors.text,
        p.colors.primary,
      );
      expect(
        contrastRatio(tokens.foreground, tokens.background),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(tokens.cardForeground, tokens.card),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("covers most of the marquee set across presets", () => {
    const used = new Set(POSTER_PRESETS.map((p) => p.titleFont));
    expect(used.size).toBeGreaterThanOrEqual(POSTER_FONTS.length - 2);
  });
});

describe("presetThemeConfig", () => {
  it("returns colors plus the title font, nothing preset-specific", () => {
    const config = presetThemeConfig(POSTER_PRESETS[0]);
    expect(config.colors).toEqual(POSTER_PRESETS[0].colors);
    expect(config.fonts).toEqual(POSTER_PRESETS[0].fonts);
    expect("effect" in config).toBe(false);
    expect("titleFont" in config).toBe(false);
  });
});
