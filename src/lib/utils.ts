import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Validates that a URL uses a safe scheme (http or https).
 * Returns the URL if valid, or undefined if it's missing/unsafe.
 */
export function sanitizeUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return url;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validates that a URL uses the https scheme specifically.
 * Used for higher-security contexts (e.g., API endpoints, upload servers).
 */
export function sanitizeHttpsUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") {
      return url;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validates that a hostname is a proper domain name (not localhost, not IP).
 * Used for lightning address domain validation.
 */
export function isValidHostname(hostname: string): boolean {
  // Reject empty, localhost, and IP addresses
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") {
    return false;
  }
  // Must contain at least one dot (basic domain check)
  if (!hostname.includes(".")) {
    return false;
  }
  // Basic hostname pattern check
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(hostname);
}

/**
 * Safely opens a URL in a new browser tab/window.
 * On Capacitor native, uses window.location.href as a fallback.
 */
export function openUrl(url: string): void {
  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) return;

  // Use window.open on web, but wrap for safety
  const newWindow = window.open(safeUrl, "_blank", "noopener,noreferrer");
  if (!newWindow) {
    // Fallback: navigate in current tab (works on Capacitor native)
    window.location.href = safeUrl;
  }
}
