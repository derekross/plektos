import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { POSTER_FONTS, loadAllPosterFonts } from "@/lib/posterFonts";

interface FontCarouselProps {
  /** Selected marquee family, or null for the classic app face. */
  value: string | null;
  onChange: (family: string | null) => void;
}

/**
 * Horizontal carousel of marquee poster faces. Each pill renders in its own
 * font so hosts pick by eye, not by name.
 */
export function FontCarousel({ value, onChange }: FontCarouselProps) {
  // The picker is the on-demand moment: fetch the faces so pills preview true.
  useEffect(() => {
    loadAllPosterFonts();
  }, []);

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-sm font-semibold">
        <Type className="h-4 w-4 text-primary" />
        Poster font
      </Label>
      <div
        className="scrollbar-hide -mx-3 flex gap-2 overflow-x-auto px-3 pb-1"
        role="radiogroup"
        aria-label="Poster font"
      >
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          onClick={() => onChange(null)}
          className={cn(
            "shrink-0 rounded-full border-2 px-4 py-2 text-sm transition-colors",
            value === null
              ? "border-primary bg-primary/15 font-semibold"
              : "border-border bg-card hover:border-primary/50",
          )}
        >
          Classic
        </button>
        {POSTER_FONTS.map((font) => (
          <button
            key={font.family}
            type="button"
            role="radio"
            aria-checked={value === font.family}
            onClick={() =>
              onChange(value === font.family ? null : font.family)
            }
            className={cn(
              "shrink-0 rounded-full border-2 px-4 py-2 transition-colors",
              value === font.family
                ? "border-primary bg-primary/15"
                : "border-border bg-card hover:border-primary/50",
            )}
          >
            <span
              className="block text-base leading-tight"
              style={{ fontFamily: `'${font.family}', 'Outfit Variable', sans-serif` }}
            >
              {font.family.replace(" Variable", "")}
            </span>
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              {font.vibe}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
