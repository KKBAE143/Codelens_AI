"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { XpStreakBadge } from "@/components/XpStreakBadge";
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

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function Navbar() {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!drawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    const firstFocusable = drawerRef.current?.querySelector<HTMLElement>("a, button");
    firstFocusable?.focus();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

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

  const navLinks = [
    { href: "/explore", label: "Explore Courses", primary: true },
    ...(mounted && isAuthenticated ? [{ href: "/dashboard", label: "My Learning", primary: false }] : []),
    { href: "/pricing", label: "Pricing", primary: false },
  ];

  return (
    <>
      <nav className="navbar-lms">
        <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
          <Link href="/" style={{
            fontFamily: "var(--font-heading)",
            fontSize: "1.2rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
          }}>
            <span style={{ color: "var(--accent)", fontSize: "1.3rem" }}>&#9673;</span>
            <span className="hide-on-mobile">CodeLens AI</span>
          </Link>
          {navLinks.map(({ href, label, primary }) => (
            <Link key={href} href={href} className="hide-on-mobile" style={{
              fontSize: "0.88rem",
              color: pathname === href || pathname.startsWith(href + "/") ? "var(--accent)" : "var(--text-secondary)",
              textDecoration: "none",
              fontWeight: pathname === href || pathname.startsWith(href + "/") ? 600 : primary ? 500 : 400,
              transition: "color 0.15s",
            }}>
              {label}
            </Link>
          ))}
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
            <div className="hide-on-mobile" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <Link href="/profile/stats" style={{ textDecoration: "none" }}>
                <XpStreakBadge />
              </Link>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {user?.avatarUrl && (
                  <img src={user.avatarUrl} alt="" style={{
                    width: 30, height: 30, borderRadius: "50%",
                    border: "2px solid var(--border-color)",
                  }} />
                )}
                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                  {user?.displayName}
                </span>
              </div>
              <button className="btn-ghost" onClick={logout} style={{ fontSize: "0.8rem" }}>
                Sign out
              </button>
            </div>
          ) : (
            <button className="btn-primary hide-on-mobile" onClick={login} style={{ padding: "0.5rem 1.15rem", fontSize: "0.85rem" }}>
              Sign in with GitHub
            </button>
          )}

          <button
            className="navbar-hamburger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
          >
            <HamburgerIcon />
          </button>
        </div>
      </nav>

      {drawerOpen && (
        <>
          <div
            className="nav-drawer-overlay"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            className="nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div className="nav-drawer-header">
              <Link href="/" className="nav-drawer-logo" onClick={() => setDrawerOpen(false)}>
                <span style={{ color: "var(--accent)" }}>&#9673;</span> CodeLens AI
              </Link>
              <button
                className="nav-drawer-close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation menu"
              >
                <CloseIcon />
              </button>
            </div>

            <nav className="nav-drawer-links">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`nav-drawer-link ${pathname === href || pathname.startsWith(href + "/") ? "nav-drawer-link-active" : ""}`}
                  onClick={() => setDrawerOpen(false)}
                >
                  {label}
                </Link>
              ))}
            </nav>

            <div className="nav-drawer-footer">
              {mounted && (
                <button
                  className="theme-toggle-btn"
                  onClick={() => { toggleTheme(); setDrawerOpen(false); }}
                  aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                  style={{ width: "100%", height: 40, borderRadius: "var(--radius-sm)", justifyContent: "flex-start", paddingLeft: "0.75rem", gap: "0.5rem" }}
                >
                  {isDark ? <SunIcon /> : <MoonIcon />}
                  <span style={{ fontSize: "0.9rem" }}>{isDark ? "Light mode" : "Dark mode"}</span>
                </button>
              )}
              {mounted && (
                isAuthenticated ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {user?.avatarUrl && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0.75rem", borderTop: "1px solid var(--border-color)" }}>
                        <img src={user.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid var(--border-color)" }} />
                        <span style={{ fontSize: "0.9rem", color: "var(--text-primary)", fontWeight: 500 }}>{user.displayName}</span>
                      </div>
                    )}
                    <button className="btn-ghost" onClick={() => { logout(); setDrawerOpen(false); }} style={{ justifyContent: "flex-start", padding: "0.5rem 0.75rem" }}>
                      Sign out
                    </button>
                  </div>
                ) : (
                  <button className="btn-primary" onClick={() => { login(); setDrawerOpen(false); }} style={{ width: "100%" }}>
                    Sign in with GitHub
                  </button>
                )
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
