"use client";

import { type ReactNode, useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { ToastProvider } from "./Toast";
import { PageTransition } from "./PageTransition";

export function ClientProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    const hasCsrf = document.cookie.includes("csrf-token=");
    if (!hasCsrf) {
      fetch("/api/csrf-token").catch(() => {});
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Navbar />
        <PageTransition>
          {children}
        </PageTransition>
        <Footer />
      </ToastProvider>
    </QueryClientProvider>
  );
}
