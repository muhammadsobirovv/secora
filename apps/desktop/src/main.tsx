import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
import "./styles/theme.css";

// Same react-query setup as apps/web (see apps/web/app/providers.tsx) —
// the Desktop Chat/Dashboard/Findings pages reuse the same query-key
// conventions, just backed by Tauri's `invoke()` (lib/tauri-client.ts)
// instead of `fetch()` against the NestJS API.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
