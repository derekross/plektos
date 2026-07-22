import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestApp } from "@/test/TestApp";
import { PosterPreview, formatPreviewEyebrow } from "./PosterPreview";
import { POSTER_PRESETS, presetThemeConfig } from "@/lib/posterPresets";

describe("formatPreviewEyebrow", () => {
  it("shows a placeholder before a date is picked", () => {
    expect(formatPreviewEyebrow()).toBe("SOMEDAY · SOON");
    expect(formatPreviewEyebrow("not-a-date")).toBe("SOMEDAY · SOON");
  });

  it("formats date-only events", () => {
    expect(formatPreviewEyebrow("2026-08-01")).toBe("SAT · AUG 1");
  });

  it("formats date + time events", () => {
    expect(formatPreviewEyebrow("2026-08-01", "20:00")).toBe(
      "SAT · AUG 1 · 8 PM",
    );
    expect(formatPreviewEyebrow("2026-08-01", "20:30")).toBe(
      "SAT · AUG 1 · 8:30 PM",
    );
  });
});

describe("PosterPreview", () => {
  it("shows a placeholder title until the host types one", () => {
    render(
      <TestApp>
        <PosterPreview title="" theme={null} effect={null} />
      </TestApp>,
    );
    expect(screen.getByText("Your Party Here")).toBeInTheDocument();
  });

  it("renders the typed title, host chip, and RSVP mock", () => {
    render(
      <TestApp>
        <PosterPreview
          title="Rooftop Solstice Rave"
          hostName="derek"
          theme={null}
          effect={null}
          startDate="2026-08-01"
          startTime="20:00"
        />
      </TestApp>,
    );
    expect(screen.getByText("Rooftop Solstice Rave")).toBeInTheDocument();
    expect(screen.getByText("@derek")).toBeInTheDocument();
    expect(screen.getByText("SAT · AUG 1 · 8 PM")).toBeInTheDocument();
    expect(screen.getByText("Going ✨")).toBeInTheDocument();
  });

  it("applies a preset theme's title font as the scoped font variable", () => {
    const preset = POSTER_PRESETS[0];
    render(
      <TestApp>
        <PosterPreview
          title="Vibes"
          theme={presetThemeConfig(preset)}
          effect={preset.effect}
        />
      </TestApp>,
    );
    const poster = screen.getByTestId("poster-preview");
    expect(poster.style.getPropertyValue("--title-font-family")).toContain(
      preset.titleFont,
    );
  });
});
