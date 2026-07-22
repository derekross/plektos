import { useEffect } from "react";
import { ScopedTheme } from "@/components/ScopedTheme";
import { EffectsLayer } from "@/components/EffectsLayer";
import { loadPosterFont } from "@/lib/posterFonts";
import { sanitizeUrl } from "@/lib/utils";
import type { ThemeConfig } from "@/lib/themes";
import type { EventEffect } from "@/lib/effects";

interface PosterPreviewProps {
  title: string;
  /** Host display name for the "Woven by" chip. */
  hostName?: string;
  theme: ThemeConfig | null;
  effect: EventEffect | null;
  /** YYYY-MM-DD */
  startDate?: string;
  /** HH:MM */
  startTime?: string;
  className?: string;
}

/** Default poster colors when the host hasn't picked a theme yet. */
const DEFAULT_POSTER_COLORS = {
  background: "260 60% 6%",
  text: "260 20% 92%",
  primary: "280 100% 70%",
};

/** "SAT · AUG 2 · 8 PM" from the form's date/time fields. */
export function formatPreviewEyebrow(
  startDate?: string,
  startTime?: string,
): string {
  if (!startDate) return "SOMEDAY · SOON";
  const date = new Date(`${startDate}T${startTime || "12:00"}:00`);
  if (Number.isNaN(date.getTime())) return "SOMEDAY · SOON";

  const day = date
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();
  const md = date
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toUpperCase();
  if (!startTime) return `${day} · ${md}`;

  const time = date
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: date.getMinutes() ? "2-digit" : undefined,
    })
    .replace(/\s/g, " ")
    .toUpperCase();
  return `${day} · ${md} · ${time}`;
}

/**
 * The live mini-poster — hero of the "Throw a party" flow.
 *
 * A scaled-down composition of the EventDetail Living Poster that restyles
 * itself as the host types a title and picks a theme, face, and effect.
 */
export function PosterPreview({
  title,
  hostName,
  theme,
  effect,
  startDate,
  startTime,
  className,
}: PosterPreviewProps) {
  const colors = theme?.colors ?? DEFAULT_POSTER_COLORS;
  const titleFamily = theme?.fonts?.find((f) => f.role === "title")?.family;

  useEffect(() => {
    if (titleFamily) void loadPosterFont(titleFamily);
  }, [titleFamily]);

  const backgroundUrl = sanitizeUrl(theme?.background?.url);
  const eyebrow = formatPreviewEyebrow(startDate, startTime);

  const titleFontVar = titleFamily
    ? {
        "--title-font-family": `'${titleFamily.replace(/['\\]/g, "")}', 'Outfit Variable', Outfit, system-ui, sans-serif`,
      }
    : undefined;

  return (
    <ScopedTheme
      colors={colors}
      className={`overflow-hidden rounded-3xl border border-border/60 shadow-lg ${className ?? ""}`}
    >
      <div
        className="relative flex min-h-[300px] flex-col justify-end sm:min-h-[340px]"
        style={titleFontVar as React.CSSProperties}
        data-testid="poster-preview"
      >
        {/* Backdrop: theme image, or the aurora wash from the Living Poster */}
        <div className="absolute inset-0 bg-background" aria-hidden>
          {backgroundUrl ? (
            <img
              src={backgroundUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full">
              <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-primary/30 blur-3xl" />
              <div className="absolute -right-12 top-1/3 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
              <div className="absolute bottom-0 left-1/3 h-44 w-44 rounded-full bg-primary/25 blur-3xl" />
            </div>
          )}
          <div className="absolute inset-0 poster-scrim" />
        </div>

        {effect && <EffectsLayer effect={effect} />}

        {/* Poster composition */}
        <div className="relative z-10 space-y-3 p-6 pb-5 text-foreground">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/80">
            {eyebrow}
          </p>
          <h2 className="font-title text-balance break-words text-[clamp(1.9rem,6vw,3rem)] font-extrabold leading-[1.05] drop-shadow-[0_2px_20px_hsl(var(--background)/0.8)]">
            {title.trim() || "Your Party Here"}
          </h2>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-background/50 px-3 py-1 text-xs backdrop-blur">
            <span className="text-muted-foreground">Woven by </span>
            <span className="font-semibold">@{hostName || "you"}</span>
          </div>

          {/* Mock RSVP dock so the host sees the whole moment */}
          <div
            className="mt-2 flex items-center gap-2 rounded-full bg-background/50 p-1.5 backdrop-blur"
            aria-hidden
          >
            <span className="flex-1 rounded-full bg-primary px-3 py-1.5 text-center text-xs font-semibold text-primary-foreground">
              Going ✨
            </span>
            <span className="flex-1 rounded-full px-3 py-1.5 text-center text-xs font-medium">
              Maybe 🤔
            </span>
            <span className="flex-1 rounded-full px-3 py-1.5 text-center text-xs font-medium">
              Can't 😢
            </span>
          </div>
        </div>
      </div>
    </ScopedTheme>
  );
}
