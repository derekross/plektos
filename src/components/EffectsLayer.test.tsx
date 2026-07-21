import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EffectsLayer } from "./EffectsLayer";

describe("EffectsLayer", () => {
  it("renders confetti particles", () => {
    render(<EffectsLayer effect="confetti" />);
    const layer = screen.getByTestId("effects-layer");
    expect(layer).toHaveAttribute("data-effect", "confetti");
    expect(layer.querySelectorAll(".fx-fall").length).toBeGreaterThan(0);
  });

  it("renders exactly five laser beams", () => {
    render(<EffectsLayer effect="lasers" />);
    const layer = screen.getByTestId("effects-layer");
    expect(layer.querySelectorAll(".fx-laser")).toHaveLength(5);
  });

  it("is hidden from assistive tech", () => {
    render(<EffectsLayer effect="sparkles" />);
    expect(screen.getByTestId("effects-layer")).toHaveAttribute("aria-hidden");
  });
});
