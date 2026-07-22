import { Label } from "@/components/ui/label";
import { Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EVENT_EFFECTS, type EventEffect } from "@/lib/effects";

interface EffectPickerProps {
  value: EventEffect | null;
  onChange: (effect: EventEffect | null) => void;
}

const EFFECT_META: Record<EventEffect, { emoji: string; label: string }> = {
  confetti: { emoji: "🎊", label: "Confetti" },
  "floating-emoji": { emoji: "🎈", label: "Floaties" },
  sparkles: { emoji: "✨", label: "Sparkles" },
  petals: { emoji: "🌸", label: "Petals" },
  lasers: { emoji: "🔦", label: "Lasers" },
};

/** Pill row for the ambient effect layer — previews live on the poster. */
export function EffectPicker({ value, onChange }: EffectPickerProps) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-sm font-semibold">
        <Wand2 className="h-4 w-4 text-primary" />
        Ambient effect
      </Label>
      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="Ambient effect"
      >
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          onClick={() => onChange(null)}
          className={cn(
            "rounded-full border-2 px-4 py-2 text-sm transition-colors",
            value === null
              ? "border-primary bg-primary/15 font-semibold"
              : "border-border bg-card hover:border-primary/50",
          )}
        >
          None
        </button>
        {EVENT_EFFECTS.map((effect) => (
          <button
            key={effect}
            type="button"
            role="radio"
            aria-checked={value === effect}
            onClick={() => onChange(value === effect ? null : effect)}
            className={cn(
              "rounded-full border-2 px-4 py-2 text-sm transition-colors",
              value === effect
                ? "border-primary bg-primary/15 font-semibold"
                : "border-border bg-card hover:border-primary/50",
            )}
          >
            {EFFECT_META[effect].emoji} {EFFECT_META[effect].label}
          </button>
        ))}
      </div>
    </div>
  );
}
