import path from "node:path";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: true, // Allow external connections (equivalent to 0.0.0.0)
    port: 8080,
    strictPort: false, // Allow port fallback if 8080 is busy
    open: false, // Don't auto-open browser
  },
  plugins: [react()],
  build: {
    // Ensure assets are versioned with hashes for cache busting
    rollupOptions: {
      output: {
        // Add hash to all asset filenames for cache busting
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
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
