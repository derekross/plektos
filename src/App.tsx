// NOTE: This file should normally not be modified unless you are adding a new provider.
// To add new routes, edit the AppRouter.tsx file.

import { useEffect } from "react";
import { Toaster } from "sonner";
import { Layout } from "@/components/Layout";
import AppRouter from "./AppRouter";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeColorMeta } from "@/components/ThemeColorMeta";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { NotificationManager } from "@/components/NotificationManager";
import { PullToRefresh } from "@/components/PullToRefresh";
import { cleanupOldCache } from "@/lib/indexedDB";

export function App() {
  // Clean up old cached data on app start (non-blocking)
  useEffect(() => {
    // Clean up cache entries older than 7 days
    cleanupOldCache(7 * 24 * 60 * 60 * 1000).catch(() => {});
  }, []);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="plektos-theme">
      <NotificationProvider>
        <NotificationManager>
          <ThemeColorMeta />
          <PullToRefresh>
            <Layout>
              <AppRouter />
            </Layout>
          </PullToRefresh>
          <Toaster />
        </NotificationManager>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;
