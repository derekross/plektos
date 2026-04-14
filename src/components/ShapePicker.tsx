import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getEmojiMaskUrl, getShapeMaskStyle } from "@/lib/avatarShapes";
import { cn } from "@/lib/utils";

interface ShapePickerProps {
  value: string | undefined;
  onChange: (shape: string | undefined) => void;
}

const SHAPE_CATEGORIES = [
  {
    label: "Geometric",
    emojis: ["⭕", "🔷", "❤️", "⭐", "⬡", "🟪", "🔺"],
  },
  {
    label: "Nature",
    emojis: ["🍃", "🌸", "☁️", "☀️", "🌙", "❄️", "🔥"],
  },
  {
    label: "Fun",
    emojis: ["👻", "👽", "💀", "👑", "💎", "🛡️", "⚡"],
  },
] as const;

export function ShapePicker({ value, onChange }: ShapePickerProps) {
  const maskUrl = useMemo(() => {
    if (!value) return "";
    return getEmojiMaskUrl(value);
  }, [value]);

  const maskStyle = useMemo(() => {
    if (!maskUrl) return undefined;
    return getShapeMaskStyle(maskUrl);
  }, [maskUrl]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Avatar Shape</Label>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => onChange(undefined)}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Live preview */}
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          {maskStyle ? (
            <div
              className="h-16 w-16 rounded-none bg-gradient-to-br from-primary to-primary/60"
              style={maskStyle}
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-primary/60" />
          )}
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center text-lg font-semibold text-primary-foreground select-none pointer-events-none",
              maskStyle && "opacity-0",
            )}
          >
            AB
          </span>
        </div>
        <div className="text-sm text-muted-foreground">
          {value ? (
            <span>
              Shape: <span className="text-base">{value}</span>
            </span>
          ) : (
            <span>Default circle</span>
          )}
        </div>
      </div>

      {/* Emoji grid */}
      <div className="space-y-3">
        {SHAPE_CATEGORIES.map((category) => (
          <div key={category.label}>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {category.label}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {category.emojis.map((emoji) => {
                const isSelected = value === emoji;
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onChange(isSelected ? undefined : emoji)}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl text-xl transition-all",
                      "hover:bg-accent hover:scale-110",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isSelected
                        ? "bg-primary/10 ring-2 ring-primary shadow-sm scale-110"
                        : "bg-muted/50",
                    )}
                    aria-label={`Select ${emoji} shape`}
                    aria-pressed={isSelected}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
