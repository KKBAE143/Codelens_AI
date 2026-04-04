"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/Toast";

export default function CreateOrganization() {
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [slugMessage, setSlugMessage] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) login();
  }, [authLoading, isAuthenticated, login]);

  const checkSlugAvailability = useCallback((slugValue: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!slugValue || slugValue.length < 2) {
      setSlugStatus("idle");
      setSlugMessage("");
      return;
    }

    setSlugStatus("checking");
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/org/check-slug?slug=${encodeURIComponent(slugValue)}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.available) {
          setSlugStatus("available");
          setSlugMessage("Available!");
        } else {
          setSlugStatus("taken");
          setSlugMessage(data.reason || "Slug not available");
        }
      } catch {
        setSlugStatus("idle");
        setSlugMessage("");
      }
    }, 400);
  }, []);

  useEffect(() => {
    if (!slugManual) {
      const derived = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
      setSlug(derived);
      checkSlugAvailability(derived);
    }
  }, [name, slugManual, checkSlugAvailability]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create organization");
      showToast("Organization created!", "success");
      router.push(`/org/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="skeleton" style={{ width: 200, height: 40 }} />
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <h1 style={{
        fontFamily: "var(--font-heading)",
        fontSize: "1.75rem",
        fontWeight: 700,
        marginBottom: "0.5rem",
      }}>
        Create Organization
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
        Set up a team workspace to collaborate on codebase courses.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.375rem" }}>
            Organization Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Engineering"
            required
            minLength={2}
            maxLength={60}
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              border: "2px solid var(--border-color)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.95rem",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              outline: "none",
              fontFamily: "var(--font-body)",
            }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.375rem" }}>
            URL Slug
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ color: "var(--text-tertiary)", fontSize: "0.85rem" }}>codelens.ai/org/</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                const val = e.target.value;
                setSlug(val);
                setSlugManual(true);
                checkSlugAvailability(val);
              }}
              placeholder="acme-eng"
              required
              pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
              style={{
                flex: 1,
                padding: "0.75rem 1rem",
                border: `2px solid ${slugStatus === "available" ? "var(--teal)" : slugStatus === "taken" ? "var(--error)" : "var(--border-color)"}`,
                borderRadius: "var(--radius-md)",
                fontSize: "0.95rem",
                fontFamily: "var(--font-mono)",
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>
          <p style={{
            fontSize: "0.75rem",
            marginTop: "0.25rem",
            color: slugStatus === "available" ? "var(--teal)" : slugStatus === "taken" ? "var(--error)" : "var(--text-tertiary)",
          }}>
            {slugStatus === "checking" ? "Checking availability..." :
             slugStatus === "available" || slugStatus === "taken" ? slugMessage :
             "3-40 characters, lowercase letters, numbers, and hyphens only"}
          </p>
        </div>

        {error && (
          <p style={{ color: "var(--error)", fontSize: "0.85rem" }}>{error}</p>
        )}

        <button
          type="submit"
          className="btn-primary"
          disabled={isSubmitting || !name || !slug || slugStatus === "taken" || slugStatus === "checking"}
          style={{ padding: "0.75rem", fontSize: "0.95rem" }}
        >
          {isSubmitting ? "Creating..." : "Create Organization"}
        </button>
      </form>
    </main>
  );
}
