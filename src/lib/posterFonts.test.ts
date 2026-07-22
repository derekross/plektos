import { describe, it, expect } from "vitest";
import {
  POSTER_FONTS,
  isPosterFontFamily,
  posterTitleFont,
  loadPosterFont,
} from "./posterFonts";

describe("POSTER_FONTS", () => {
  it("ships the eight marquee faces", () => {
    expect(POSTER_FONTS).toHaveLength(8);
  });

  it("has unique family names", () => {
    const families = POSTER_FONTS.map((f) => f.family);
    expect(new Set(families).size).toBe(families.length);
  });

  it("gives every face a loader and a vibe label", () => {
    for (const font of POSTER_FONTS) {
      expect(typeof font.load).toBe("function");
      expect(font.vibe.length).toBeGreaterThan(0);
    }
  });

  it("uses families safe to interpolate into CSS", () => {
    for (const font of POSTER_FONTS) {
      expect(font.family).toMatch(/^[A-Za-z0-9 ]+$/);
    }
  });
});

describe("isPosterFontFamily", () => {
  it("recognizes shipped families", () => {
    expect(isPosterFontFamily("Unbounded")).toBe(true);
    expect(isPosterFontFamily("Shrikhand")).toBe(true);
  });

  it("rejects unknown families", () => {
    expect(isPosterFontFamily("Comic Sans MS")).toBe(false);
    expect(isPosterFontFamily("")).toBe(false);
  });
});

describe("posterTitleFont", () => {
  it("builds a title-role ThemeFont without a url (self-hosted)", () => {
    expect(posterTitleFont("Gloock")).toEqual({
      family: "Gloock",
      role: "title",
    });
  });
});

describe("loadPosterFont", () => {
  it("resolves for shipped families and is idempotent", async () => {
    await expect(loadPosterFont("Caprasimo")).resolves.toBeUndefined();
    await expect(loadPosterFont("Caprasimo")).resolves.toBeUndefined();
  });

  it("resolves quietly for unknown families", async () => {
    await expect(loadPosterFont("Papyrus")).resolves.toBeUndefined();
  });
});
