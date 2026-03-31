"use client";

import React from "react";

interface ErrorBoundaryProps {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught rendering error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: "2rem",
          textAlign: "center",
          color: "var(--text-secondary, #666)",
          fontFamily: "var(--font-body, sans-serif)",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Something went wrong</div>
          <p style={{ fontSize: "0.9rem", maxWidth: 400, margin: "0 auto 1rem" }}>
            This section encountered an error while rendering. Try refreshing the page.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid var(--border, #ccc)",
              borderRadius: "var(--radius-sm, 4px)",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "var(--font-body, sans-serif)",
              fontSize: "0.85rem",
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function BlockErrorFallback() {
  return (
    <div style={{
      padding: "1rem",
      borderRadius: "var(--radius-sm, 4px)",
      border: "1px solid var(--border, #eee)",
      background: "var(--bg-secondary, #fafafa)",
      color: "var(--text-secondary, #888)",
      fontSize: "0.85rem",
      fontFamily: "var(--font-body, sans-serif)",
    }}>
      This content block could not be displayed.
    </div>
  );
}
