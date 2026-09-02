/**
 * A horizontally scrolling row that tells you it scrolls.
 *
 * The picker rows used `overflow-x-auto scrollbar-hide`, which works on touch
 * and is a dead end with a mouse: no visible scrollbar, no drag, and a vertical
 * wheel does nothing — so the row looks like a grid that is simply cut off.
 *
 * Three affordances, all of which disappear when they are not needed:
 *   - fades at whichever edge has content beyond it;
 *   - arrow buttons, on pointer-fine devices only (they would just cover
 *     content on a phone, where dragging already works);
 *   - vertical wheel mapped to horizontal scroll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export function ScrollRow({
  children,
  className,
  ...rest
}: React.ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 1);
    // 1px of slack: fractional layout widths otherwise leave a fade showing
    // on a row that is already fully scrolled.
    setAtEnd(el.scrollLeft >= max - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    // Content arrives asynchronously (fonts, images), so remeasure on resize
    // rather than only on mount.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure, children]);

  const nudge = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={measure}
        onWheel={(e) => {
          // A mouse wheel only produces deltaY. Without this the row is
          // unreachable on a desktop with no trackpad.
          const el = ref.current;
          if (!el || e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
          const max = el.scrollWidth - el.clientWidth;
          if (max <= 0) return;
          // Only claim the gesture while there is somewhere to go, so the page
          // still scrolls when the row has reached its end.
          const next = el.scrollLeft + e.deltaY;
          if (next < 0 || next > max) return;
          e.preventDefault();
          el.scrollLeft = next;
        }}
        className={cn("scrollbar-hide -mx-3 flex gap-2 overflow-x-auto px-3 pb-1", className)}
        {...rest}
      >
        {children}
      </div>

      {/* Edge fades: `pointer-events-none` so they never eat a tap. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent transition-opacity",
          atStart && "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent transition-opacity",
          atEnd && "opacity-0",
        )}
      />

      {/* Arrows only where there is a precise pointer to use them. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Scroll left"
        onClick={() => nudge(-1)}
        className={cn(
          "absolute left-0 top-1/2 hidden -translate-y-1/2 rounded-full border bg-background/90 p-1 shadow-sm backdrop-blur transition-opacity hover:bg-background",
          "[@media(pointer:fine)]:block",
          atStart && "pointer-events-none opacity-0",
        )}
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Scroll right"
        onClick={() => nudge(1)}
        className={cn(
          "absolute right-0 top-1/2 hidden -translate-y-1/2 rounded-full border bg-background/90 p-1 shadow-sm backdrop-blur transition-opacity hover:bg-background",
          "[@media(pointer:fine)]:block",
          atEnd && "pointer-events-none opacity-0",
        )}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
