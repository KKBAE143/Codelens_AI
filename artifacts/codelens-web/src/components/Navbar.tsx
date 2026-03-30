"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navbar() {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (pathname.startsWith("/course/") || pathname.startsWith("/share/")) return null;

  return (
    <nav className="navbar-nav" style={{
      position: "sticky",
      top: 0,
      zIndex: 100,
      background: "rgba(250, 249, 246, 0.9)",
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
