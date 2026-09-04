import path from "node:path";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

/**
 * The Content-Security-Policy the packaged app ships with.
 *
 * nostr01 already sends this as a header for plektos.app, but the Capacitor
 * Android/iOS build loads from https://localhost inside a WebView and never
 * passes through nginx — without this the packaged app runs with no CSP at all.
 * Header and meta intersect on the web, so this is a faithful COPY of the
 * deployed policy, not a tightening: change one without the other and the
 * strictest union silently breaks something.
 *
 * `frame-ancestors` is omitted because meta-delivered CSP ignores it; the
 * header carries it. The wide `https:`/`wss:` sources are load-bearing rather
 * than lazy — relay URLs come from the user's own kind-10002 list, from
 * bunker:// URIs and from invite fragments, while NIP-05, LNURL-pay and Blossom
 * all resolve against domains chosen by other people.
 *
 * Injected at build time only. In dev, `@vitejs/plugin-react-swc` puts an
 * INLINE module script at the top of <head> for React Refresh, which
 * `script-src 'self'` would block — so shipping this in index.html itself would
 * trade a production fix for a broken dev server.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "media-src 'self' blob: https:",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function cspMeta() {
  return {
    name: "plektos-csp-meta",
    apply: "build" as const,
    transformIndexHtml: {
      order: "post" as const,
      handler: () => [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: CONTENT_SECURITY_POLICY,
          },
          injectTo: "head-prepend" as const,
        },
      ],
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: true, // Allow external connections (equivalent to 0.0.0.0)
    port: 8080,
    strictPort: false, // Allow port fallback if 8080 is busy
    open: false, // Don't auto-open browser
  },
  plugins: [react(), cspMeta()],
  build: {
    // Ensure assets are versioned with hashes for cache busting
    rollupOptions: {
      output: {
        // Add hash to all asset filenames for cache busting
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        manualChunks: {
          // Vendor chunks: these change rarely and cache well
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select', '@radix-ui/react-tabs', '@radix-ui/react-tooltip', '@radix-ui/react-popover', '@radix-ui/react-avatar'],
          'vendor-nostr': ['@nostrify/nostrify', '@nostrify/react', 'nostr-tools'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-map': ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    onConsoleLog(log) {
      return !log.includes("React Router Future Flag Warning");
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
