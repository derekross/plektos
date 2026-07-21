import { cn } from "@/lib/utils";

interface PlektosLogoProps {
  className?: string;
  /** Pixel size of the woven mark */
  size?: number;
  withWordmark?: boolean;
}

/**
 * Plektos brand mark: three woven rings (plektos = "woven" in Greek) in the
 * party palette, with a sparkle. Ring halos use the background token so the
 * over-under weave adapts to light and dark themes.
 */
export function PlektosLogo({
  className,
  size = 36,
  withWordmark = false,
}: PlektosLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        role="img"
        aria-label="Plektos"
      >
        <defs>
          {/* Lower-right violet/gold crossing, where violet re-crosses on top */}
          <clipPath id="plektos-weave">
            <rect x="39" y="33" width="16" height="16" />
          </clipPath>
        </defs>
        {/* Bottom ring — violet */}
        <circle cx="32" cy="43" r="14" stroke="#A78BFA" strokeWidth="5" />
        {/* Top-left ring — pink, halo knocks out the ring beneath */}
        <circle
          cx="23"
          cy="27"
          r="14"
          stroke="hsl(var(--background))"
          strokeWidth="9"
        />
        <circle cx="23" cy="27" r="14" stroke="#E879F9" strokeWidth="5" />
        {/* Top-right ring — gold */}
        <circle
          cx="41"
          cy="27"
          r="14"
          stroke="hsl(var(--background))"
          strokeWidth="9"
        />
        <circle cx="41" cy="27" r="14" stroke="#FDE68A" strokeWidth="5" />
        {/* Violet ring re-crosses the gold ring to close the weave */}
        <g clipPath="url(#plektos-weave)">
          <circle
            cx="32"
            cy="43"
            r="14"
            stroke="hsl(var(--background))"
            strokeWidth="9"
          />
          <circle cx="32" cy="43" r="14" stroke="#A78BFA" strokeWidth="5" />
        </g>
        {/* Sparkle */}
        <path
          d="M 54 6 L 55.8 10.2 L 60 12 L 55.8 13.8 L 54 18 L 52.2 13.8 L 48 12 L 52.2 10.2 Z"
          fill="#FDE68A"
        />
      </svg>
      {withWordmark && (
        <span className="font-display text-2xl font-bold tracking-tight text-party-gradient">
          plektos
        </span>
      )}
    </span>
  );
}
