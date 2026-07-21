import { useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { EventEffect } from "@/lib/effects";
import { cn } from "@/lib/utils";

interface EffectsLayerProps {
  effect: EventEffect;
  className?: string;
}

interface Particle {
  left: number;
  size: number;
  delay: number;
  duration: number;
  glyph: string;
  color: string;
  top: number;
}

const EFFECT_GLYPHS: Partial<Record<EventEffect, string[]>> = {
  "floating-emoji": ["🎈", "🎉", "🪩", "🥳", "✨"],
  sparkles: ["✨"],
  petals: ["🌸", "🌺", "🌷"],
};

const CONFETTI_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--glow-2))",
  "#FFC93D",
  "#FB7185",
];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** Pause all particle animations while the tab is hidden (battery, Capacitor). */
function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(() => document.visibilityState === "hidden");

  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return hidden;
}

/**
 * Ambient effect layer for the Living Poster.
 *
 * Pure CSS transform loops — no canvas, no rAF — so it stays GPU-cheap in the
 * Capacitor webview. Particle counts are capped harder on mobile, everything
 * pauses when the tab is hidden, and reduced-motion renders nothing at all.
 */
export function EffectsLayer({ effect, className }: EffectsLayerProps) {
  const isMobile = useIsMobile();
  const reducedMotion = usePrefersReducedMotion();
  const pageHidden = usePageHidden();

  const count = effect === "lasers" ? 5 : isMobile ? 10 : 18;

  const particles = useMemo<Particle[]>(() => {
    const glyphs = EFFECT_GLYPHS[effect] ?? [];
    return Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 0.75 + Math.random() * 0.9,
      delay: -(Math.random() * 12),
      duration: 7 + Math.random() * 9,
      glyph: glyphs.length ? glyphs[i % glyphs.length] : "",
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    }));
  }, [effect, count]);

  if (reducedMotion) return null;

  return (
    <div
      aria-hidden
      data-testid="effects-layer"
      data-effect={effect}
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        pageHidden && "fx-paused",
        className,
      )}
    >
      {particles.map((p, i) => {
        const style: React.CSSProperties = {
          left: `${p.left}%`,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`,
        };

        switch (effect) {
          case "confetti":
            return (
              <span
                key={i}
                className="fx-particle fx-fall"
                style={{
                  ...style,
                  top: "-6%",
                  width: `${p.size * 0.55}rem`,
                  height: `${p.size * 0.85}rem`,
                  borderRadius: "2px",
                  backgroundColor: p.color,
                }}
              />
            );
          case "floating-emoji":
            return (
              <span
                key={i}
                className="fx-particle fx-float"
                style={{ ...style, bottom: "-10%", fontSize: `${p.size * 1.4}rem` }}
              >
                {p.glyph}
              </span>
            );
          case "sparkles":
            return (
              <span
                key={i}
                className="fx-particle fx-twinkle"
                style={{
                  ...style,
                  top: `${p.top}%`,
                  fontSize: `${p.size * 1.1}rem`,
                  animationDuration: `${2 + (p.duration % 3)}s`,
                }}
              >
                {p.glyph}
              </span>
            );
          case "petals":
            return (
              <span
                key={i}
                className="fx-particle fx-fall-sway"
                style={{ ...style, top: "-8%", fontSize: `${p.size * 1.2}rem` }}
              >
                {p.glyph}
              </span>
            );
          case "lasers":
            return (
              <span
                key={i}
                className="fx-particle fx-laser"
                style={{
                  left: `${10 + i * 20}%`,
                  animationDelay: `${-i * 1.3}s`,
                  animationDuration: `${6 + i * 1.5}s`,
                }}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
