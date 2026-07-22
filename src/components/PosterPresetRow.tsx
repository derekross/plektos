import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScopedTheme } from "@/components/ScopedTheme";
import { POSTER_PRESETS, type PosterPreset } from "@/lib/posterPresets";
import { loadPosterFont } from "@/lib/posterFonts";

interface PosterPresetRowProps {
  /** Identifier of the applied preset, or null. */
  value: string | null;
  onSelect: (preset: PosterPreset | null) => void;
}

/**
 * One-tap complete vibes: each swatch applies a curated theme + marquee
 * face + ambient effect together.
 */
export function PosterPresetRow({ value, onSelect }: PosterPresetRowProps) {
  useEffect(() => {
    for (const p of POSTER_PRESETS) void loadPosterFont(p.titleFont);
  }, []);

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" />
        Quick vibes
      </Label>
      <div
        className="scrollbar-hide -mx-3 flex gap-2 overflow-x-auto px-3 pb-1"
        role="radiogroup"
        aria-label="Quick vibes"
      >
        {POSTER_PRESETS.map((preset) => {
          const selected = value === preset.identifier;
          return (
            <button
              key={preset.identifier}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(selected ? null : preset)}
              className={cn(
                "shrink-0 overflow-hidden rounded-2xl border-2 text-left transition-colors",
                selected ? "border-primary" : "border-border hover:border-primary/50",
              )}
            >
              <ScopedTheme colors={preset.colors}>
                <div className="w-28 bg-background px-3 py-2.5">
                  <div
                    className="truncate text-sm font-bold text-foreground"
                    style={{
                      fontFamily: `'${preset.titleFont}', 'Outfit Variable', sans-serif`,
                    }}
                  >
                    {preset.title}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1">
                    <span className="h-3 w-3 rounded-full bg-primary" />
                    <span className="truncate text-[10px] text-muted-foreground">
                      {preset.effect}
                    </span>
                  </div>
                </div>
              </ScopedTheme>
            </button>
          );
        })}
      </div>
    </div>
  );
}
