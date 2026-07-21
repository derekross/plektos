import { describe, it, expect } from "vitest";
import {
  contrastRatio,
  ensureReadable,
  deriveTokensFromCore,
  FEATURED_THEMES,
} from "./themes";

describe("contrastRatio", () => {
  it("returns 21 for black on white", () => {
    expect(contrastRatio("0 0% 0%", "0 0% 100%")).toBeCloseTo(21, 1);
  });

  it("returns 1 for identical colors", () => {
    expect(contrastRatio("220 50% 50%", "220 50% 50%")).toBeCloseTo(1, 3);
  });

  it("is symmetric", () => {
    const a = "280 100% 70%";
    const b = "240 24% 6%";
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 5);
  });
});

describe("ensureReadable", () => {
  it("leaves already-readable pairs untouched", () => {
    const fg = "260 20% 92%";
    expect(ensureReadable(fg, "260 60% 6%")).toBe(fg);
  });

  it("clamps unreadable light-on-light text to AA", () => {
    const clamped = ensureReadable("0 0% 85%", "0 0% 98%");
    expect(contrastRatio(clamped, "0 0% 98%")).toBeGreaterThanOrEqual(4.5);
  });

  it("clamps unreadable dark-on-dark text to AA", () => {
    const clamped = ensureReadable("240 30% 20%", "240 24% 6%");
    expect(contrastRatio(clamped, "240 24% 6%")).toBeGreaterThanOrEqual(4.5);
  });

  it("preserves hue while clamping", () => {
    const clamped = ensureReadable("340 80% 90%", "340 25% 96%");
    expect(clamped.startsWith("340 ")).toBe(true);
  });

  it("falls back toward white/black when a saturated hue cannot reach AA", () => {
    // Fully saturated yellow-green on white never reaches 4.5 by lightness alone
    const clamped = ensureReadable("60 100% 50%", "0 0% 100%");
    expect(contrastRatio(clamped, "0 0% 100%")).toBeGreaterThan(
      contrastRatio("60 100% 50%", "0 0% 100%"),
    );
  });
});

describe("deriveTokensFromCore contrast clamp", () => {
  it("produces AA foreground/background for a hostile light theme", () => {
    const tokens = deriveTokensFromCore("0 0% 98%", "0 0% 90%", "60 100% 80%");
    expect(contrastRatio(tokens.foreground, tokens.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.cardForeground, tokens.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.secondaryForeground, tokens.secondary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.mutedForeground, tokens.muted)).toBeGreaterThanOrEqual(4.5);
  });

  it("produces AA foreground/background for a hostile dark theme", () => {
    const tokens = deriveTokensFromCore("240 24% 6%", "240 24% 12%", "240 20% 15%");
    expect(contrastRatio(tokens.foreground, tokens.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.primaryForeground, tokens.primary)).toBeGreaterThan(
      contrastRatio(tokens.primaryForeground === "0 0% 100%" ? "0 0% 0%" : "0 0% 100%", tokens.primary),
    );
  });

  it("keeps well-formed themes unchanged", () => {
    // Purple Haze's text already passes AA on all its surfaces
    const tokens = deriveTokensFromCore("260 60% 6%", "260 20% 92%", "280 100% 70%");
    expect(tokens.foreground).toBe("260 20% 92%");
    expect(tokens.cardForeground).toBe("260 20% 92%");
  });

  it("every featured theme passes AA after derivation", () => {
    for (const theme of FEATURED_THEMES) {
      const tokens = deriveTokensFromCore(
        theme.colors.background,
        theme.colors.text,
        theme.colors.primary,
      );
      expect(
        contrastRatio(tokens.foreground, tokens.background),
        `${theme.identifier} foreground/background`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(tokens.mutedForeground, tokens.muted),
        `${theme.identifier} mutedForeground/muted`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(tokens.accentForeground, tokens.accent),
        `${theme.identifier} accentForeground/accent`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
