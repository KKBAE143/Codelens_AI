"use client";

import { type ReactNode, useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { ToastProvider } from "./Toast";
import { PageTransition } from "./PageTransition";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getCsrfFromCookie(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function isSameOrigin(url: string): boolean {
  try {
    const resolved = new URL(url, window.location.href);
    return resolved.origin === window.location.origin;
  } catch {
    return false;
  }
}

let csrfPatched = false;

function installCsrfInterceptor() {
  if (csrfPatched) return;
  csrfPatched = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function csrfFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const method = (
      init?.method ??
      (input instanceof Request ? input.method : "GET")
    ).toUpperCase();

    if (!MUTATING_METHODS.has(method)) {
      return originalFetch(input, init);
    }

    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    if (!isSameOrigin(rawUrl)) {
      return originalFetch(input, init);
    }

    let token = getCsrfFromCookie();
    if (!token) {
      try {
        const csrfRes = await originalFetch("/api/csrf-token");
        const csrfData = await csrfRes.json();
        token = csrfData.csrfToken || getCsrfFromCookie();
      } catch {}
    }

    if (token) {
      const existingHeaders =
        init?.headers ??
        (input instanceof Request ? input.headers : undefined);
      const headers = new Headers(existingHeaders);
      if (!headers.has("x-csrf-token")) {
        headers.set("x-csrf-token", token);
      }
      return originalFetch(input, { ...init, headers });
    }

    return originalFetch(input, init);
  };
}

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
    installCsrfInterceptor();

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
