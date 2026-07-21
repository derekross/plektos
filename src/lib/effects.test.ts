import { describe, it, expect } from "vitest";
import { parseEffectFromTags, buildEffectTag, EVENT_EFFECTS } from "./effects";

describe("parseEffectFromTags", () => {
  it("reads a known effect from the fx tag", () => {
    expect(parseEffectFromTags([["fx", "confetti"]])).toBe("confetti");
  });

  it("returns null when no fx tag is present", () => {
    expect(parseEffectFromTags([["title", "Party"]])).toBeNull();
  });

  it("returns null for unknown effect values", () => {
    expect(parseEffectFromTags([["fx", "explosions"]])).toBeNull();
  });

  it("round-trips every effect through buildEffectTag", () => {
    for (const effect of EVENT_EFFECTS) {
      expect(parseEffectFromTags([buildEffectTag(effect)])).toBe(effect);
    }
  });
});
