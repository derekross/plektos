import { cn, sanitizeUrl } from "@/lib/utils";
import { hslStringToHex, type ThemeConfig, type ThemeDefinition } from "@/lib/themes";
import { Check } from "lucide-react";

interface ThemePreviewProps {
  theme: ThemeConfig & { title?: string; description?: string };
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * A compact theme preview card showing the 3 core colors,
 * optional background image, a text sample, and the theme title.
 */
export function ThemePreview({
  theme,
  selected,
  onClick,
  className,
}: ThemePreviewProps) {
  const { colors, background } = theme;
  const bgHex = hslStringToHex(colors.background);
  const textHex = hslStringToHex(colors.text);
  const primaryHex = hslStringToHex(colors.primary);
  const title = (theme as ThemeDefinition).title ?? "Custom";
  const bgImageUrl = sanitizeUrl(background?.url);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-col rounded-2xl border-2 overflow-hidden transition-all duration-200",
        "hover:scale-105 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary ring-2 ring-primary/30 shadow-md"
          : "border-border/50 hover:border-primary/30",
        className,
      )}
    >
      {/* Color preview area — with optional background image */}
      <div
        className="w-full h-20 flex items-end p-2 gap-1 relative bg-cover bg-center"
        style={{
          backgroundColor: bgHex,
          ...(bgImageUrl ? { backgroundImage: `url(${bgImageUrl})` } : {}),
        }}
      >
        {/* Semi-transparent scrim so text stays readable over images */}
        {bgImageUrl && (
          <div
            className="absolute inset-0"
            style={{ backgroundColor: bgHex, opacity: 0.35 }}
          />
        )}

        {/* Sample text */}
        <span
          className="text-xs font-medium truncate flex-1 text-left relative z-10"
          style={{ color: textHex }}
        >
          {title}
        </span>
        {/* Primary accent dot */}
        <div
          className="w-5 h-5 rounded-full flex-shrink-0 relative z-10"
          style={{ backgroundColor: primaryHex }}
        />
      </div>

      {/* Color swatch strip */}
      <div className="flex h-2">
        <div className="flex-1" style={{ backgroundColor: bgHex }} />
        <div className="flex-1" style={{ backgroundColor: primaryHex }} />
        <div className="flex-1" style={{ backgroundColor: textHex }} />
      </div>

      {/* Title bar */}
      <div className="px-2 py-1.5 bg-card">
        <span className="text-xs font-medium text-card-foreground truncate block">
          {title}
        </span>
      </div>

      {/* Selection indicator */}
      {selected && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center z-20">
          <Check className="w-3 h-3 text-primary-foreground" />
        </div>
      )}
    </button>
  );
}
