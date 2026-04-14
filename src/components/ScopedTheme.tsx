import { useMemo } from "react";
import {
  deriveTokensFromCore,
  tokensToCssVars,
  type CoreThemeColors,
} from "@/lib/themes";

interface ScopedThemeProps {
  colors: CoreThemeColors;
  children: React.ReactNode;
  className?: string;
}

/**
 * Renders children within a scoped theme context.
 *
 * Derives all 19 CSS tokens from 3 core colors and injects them as
 * inline CSS custom properties on a wrapper div. Children using Tailwind
 * semantic classes (bg-background, text-foreground, etc.) will pick up
 * the scoped values.
 *
 * Use this for theme previews and themed event cards — anywhere you want
 * a contained theme that doesn't affect the rest of the page.
 */
export function ScopedTheme({ colors, children, className }: ScopedThemeProps) {
  const cssVars = useMemo(() => {
    const tokens = deriveTokensFromCore(
      colors.background,
      colors.text,
      colors.primary,
    );
    return tokensToCssVars(tokens);
  }, [colors.background, colors.text, colors.primary]);

  return (
    <div style={cssVars} className={className}>
      {children}
    </div>
  );
}
