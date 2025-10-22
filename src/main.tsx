import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { NostrLoginProvider } from "@nostrify/react/login";
import NostrProvider from "@/components/NostrProvider";
import { App } from "./App";
import "@fontsource-variable/outfit";
import "./index.css";
import "leaflet/dist/leaflet.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 0, // Always consider data stale
      gcTime: 0, // Don't garbage collect
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <NostrLoginProvider storageKey="plektos-login">
          <NostrProvider
            relays={[
              "wss://relay.damus.io",
              "wss://nos.lol",
              "wss://relay.snort.social",
              "wss://relay.nostr.band",
              "wss://relay.primal.net",
            ]}
          >
            <App />
          </NostrProvider>
        </NostrLoginProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
