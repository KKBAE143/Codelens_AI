"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function Navbar() {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    const html = document.documentElement;
    if (html.classList.contains("dark")) {
      setIsDark(true);
    } else if (html.classList.contains("light")) {
      setIsDark(false);
    } else {
      setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
  }, []);

  const toggleTheme = () => {
    const html = document.documentElement;
    if (isDark) {
      html.classList.remove("dark");
      html.classList.add("light");
      localStorage.setItem("theme", "light");
      setIsDark(false);
    } else {
      html.classList.remove("light");
      html.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setIsDark(true);
    }
  };

  if (pathname.startsWith("/course/") || pathname.startsWith("/share/") || pathname.match(/^\/explore\/[^/]+\/[^/]+$/)) return null;

  return (
    <nav className="navbar-nav" style={{
      position: "sticky",
      top: 0,
      zIndex: 100,
      background: "var(--navbar-bg)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid var(--border-color)",
      padding: "0 1.5rem",
      height: "56px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
        <Link href="/" style={{
          fontFamily: "var(--font-heading)",
          fontSize: "1.25rem",
          fontWeight: 700,
          color: "var(--text-primary)",
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          gap: "0.375rem",
        }}>
          <span style={{ color: "var(--accent)" }}>◉</span> <span className="hide-on-mobile">CodeLens AI</span>
        </Link>
        {mounted && isAuthenticated && (
          <Link href="/dashboard" className="hide-on-mobile" style={{
            fontSize: "0.9rem",
            color: pathname === "/dashboard" ? "var(--accent)" : "var(--text-secondary)",
            textDecoration: "none",
            fontWeight: pathname === "/dashboard" ? 600 : 400,
            transition: "color 0.15s",
          }}>
            Dashboard
          </Link>
        )}
        <Link href="/explore" className="hide-on-mobile" style={{
          fontSize: "0.9rem",
          color: pathname === "/explore" || pathname.startsWith("/explore/") ? "var(--accent)" : "var(--text-secondary)",
          textDecoration: "none",
          fontWeight: pathname === "/explore" || pathname.startsWith("/explore/") ? 600 : 400,
          transition: "color 0.15s",
        }}>
          Explore
        </Link>
        <Link href="/pricing" className="hide-on-mobile" style={{
          fontSize: "0.9rem",
          color: pathname === "/pricing" ? "var(--accent)" : "var(--text-secondary)",
          textDecoration: "none",
          fontWeight: pathname === "/pricing" ? 600 : 400,
          transition: "color 0.15s",
        }}>
          Pricing
        </Link>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {mounted && (
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
        )}
        {!mounted || isLoading ? (
          <div className="skeleton hide-on-mobile" style={{ width: 80, height: 32 }} />
        ) : isAuthenticated ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {user?.avatarUrl && (
                <img src={user.avatarUrl} alt="" style={{
                  width: 28, height: 28, borderRadius: "50%",
                  border: "2px solid var(--border-color)",
                }} />
              )}
              <span className="hide-on-mobile" style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                {user?.displayName}
              </span>
            </div>
            <button className="btn-ghost" onClick={logout} style={{ fontSize: "0.8rem" }}>
              Sign out
            </button>
          </div>
        ) : (
          <button className="btn-primary" onClick={login} style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
            Sign in
          </button>
        )}
      </div>
    </nav>
  );
}
