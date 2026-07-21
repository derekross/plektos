import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { NostrLoginProvider } from "@nostrify/react/login";
import NostrProvider from "@/components/NostrProvider";
import { App } from "./App";
import "@fontsource-variable/outfit";
import "@fontsource-variable/bricolage-grotesque";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
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
              "wss://relay.primal.net",
              "wss://relay.damus.io",
              "wss://nos.lol",
              "wss://relay.ditto.pub",
            ]}
          >
            <App />
          </NostrProvider>
        </NostrLoginProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
