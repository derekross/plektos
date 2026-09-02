/**
 * A card on the event poster's below-the-fold stack.
 *
 * Extracted from EventDetail so the private event page uses the identical
 * surface rather than a lookalike that drifts.
 */
import type React from "react";
import { cn } from "@/lib/utils";

export function PosterSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("glass rounded-3xl p-4 sm:p-6", className)}>
      {title && <h3 className="font-display font-semibold text-lg mb-3">{title}</h3>}
      {children}
    </section>
  );
}
