import { useEffect, useMemo, useRef } from "react";
import {
  deriveTokensFromCore,
  tokenToCssVar,
  type ThemeConfig,
} from "@/lib/themes";

interface EventThemeProviderProps {
  theme: ThemeConfig;
  children: React.ReactNode;
}

/**
 * Full-page theme override for event detail pages.
 *
 * When mounted, derives all 19 CSS tokens from the theme's 3 core colors
 * and sets them as CSS custom properties on document.documentElement.
 * On unmount (navigation away), restores the original values.
 *
 * Also handles:
 * - Loading custom fonts specified in the theme
 * - Applying background images with cover/tile modes
 */
export function EventThemeProvider({ theme, children }: EventThemeProviderProps) {
  const originalValuesRef = useRef<Map<string, string>>(new Map());
  const fontStyleRef = useRef<HTMLStyleElement | null>(null);

  const tokens = useMemo(
    () =>
      deriveTokensFromCore(
        theme.colors.background,
        theme.colors.text,
        theme.colors.primary,
      ),
    [theme.colors.background, theme.colors.text, theme.colors.primary],
  );

  // Apply CSS custom properties to :root
  useEffect(() => {
    const root = document.documentElement;
    const saved = new Map<string, string>();

    for (const [key, value] of Object.entries(tokens)) {
      const varName = tokenToCssVar(key);
      // Save the current value so we can restore it
      saved.set(varName, root.style.getPropertyValue(varName));
      root.style.setProperty(varName, value);
    }

    originalValuesRef.current = saved;

    return () => {
      // Restore original values
      for (const [varName, oldValue] of saved) {
        if (oldValue) {
          root.style.setProperty(varName, oldValue);
        } else {
          root.style.removeProperty(varName);
        }
      }
    };
  }, [tokens]);

  // Load custom fonts
  useEffect(() => {
    if (!theme.fonts || theme.fonts.length === 0) return;

    const fontRules: string[] = [];
    const fontFamilies: { body?: string; title?: string } = {};

    for (const font of theme.fonts) {
      if (font.url) {
        fontRules.push(`
          @font-face {
            font-family: '${font.family}';
            src: url('${font.url}');
            font-display: swap;
          }
        `);
      }

      if (font.role === "body") fontFamilies.body = font.family;
      if (font.role === "title") fontFamilies.title = font.family;
    }

    if (fontFamilies.body) {
      fontRules.push(`
        html { font-family: '${fontFamilies.body}', 'Outfit Variable', Outfit, system-ui, sans-serif !important; }
      `);
    }

    if (fontFamilies.title) {
      fontRules.push(`
        :root { --title-font-family: '${fontFamilies.title}', 'Outfit Variable', Outfit, system-ui, sans-serif; }
      `);
    }

    if (fontRules.length > 0) {
      const style = document.createElement("style");
      style.textContent = fontRules.join("\n");
      document.head.appendChild(style);
      fontStyleRef.current = style;
    }

    return () => {
      if (fontStyleRef.current) {
        fontStyleRef.current.remove();
        fontStyleRef.current = null;
      }
    };
  }, [theme.fonts]);

  // Apply background image
  useEffect(() => {
    if (!theme.background?.url) return;

    const prevBg = document.body.style.backgroundImage;
    const prevBgSize = document.body.style.backgroundSize;
    const prevBgRepeat = document.body.style.backgroundRepeat;
    const prevBgPos = document.body.style.backgroundPosition;
    const prevBgAttach = document.body.style.backgroundAttachment;

    document.body.style.backgroundImage = `url("${theme.background.url}")`;

    if (theme.background.mode === "tile") {
      document.body.style.backgroundRepeat = "repeat";
      document.body.style.backgroundSize = "auto";
    } else {
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundRepeat = "no-repeat";
      document.body.style.backgroundPosition = "center";
      document.body.style.backgroundAttachment = "fixed";
    }

    return () => {
      document.body.style.backgroundImage = prevBg;
      document.body.style.backgroundSize = prevBgSize;
      document.body.style.backgroundRepeat = prevBgRepeat;
      document.body.style.backgroundPosition = prevBgPos;
      document.body.style.backgroundAttachment = prevBgAttach;
    };
  }, [theme.background]);

  return <>{children}</>;
}
