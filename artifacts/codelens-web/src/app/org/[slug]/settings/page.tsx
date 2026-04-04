"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/Toast";

async function fetchOrg(slug: string) {
  const res = await fetch(`/api/org/${slug}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load organization");
  return res.json();
}

export default function OrgSettings() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, login } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [orgName, setOrgName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) login();
  }, [authLoading, isAuthenticated, login]);

  const { data, isLoading } = useQuery({
    queryKey: ["org", slug],
    queryFn: () => fetchOrg(slug),
    enabled: isAuthenticated && !!slug,
  });

  useEffect(() => {
    if (data?.organization) {
      setOrgName(data.organization.name);
    }
  }, [data]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = { name: orgName };
      if (webhookUrl !== "") {
        body.slackWebhookUrl = webhookUrl || null;
      }

      const res = await fetch(`/api/org/${slug}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to save");
      queryClient.invalidateQueries({ queryKey: ["org", slug] });
      showToast("Settings saved!", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    setIsTesting(true);
    try {
      const res = await fetch(`/api/org/${slug}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "test_webhook" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Test failed");
      showToast("Test notification sent!", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Test failed", "error");
    } finally {
      setIsTesting(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "3rem 1.5rem" }}>
        <div className="skeleton" style={{ width: 200, height: 32, marginBottom: "1rem" }} />
        <div className="skeleton" style={{ width: "100%", height: 300 }} />
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "3rem 1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
        <button
          onClick={() => router.push(`/org/${slug}`)}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontFamily: "var(--font-body)",
          }}
        >
          ← Back
        </button>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", fontWeight: 700 }}>
          Settings
        </h1>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>
          General
        </h3>
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.375rem" }}>
            Organization Name
          </label>
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              border: "2px solid var(--border-color)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.9rem",
              fontFamily: "var(--font-body)",
              outline: "none",
            }}
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          Slack Integration
        </h3>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
          Receive notifications when courses are generated, assigned, or completed.
        </p>
        <div style={{ marginBottom: "0.75rem" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.375rem" }}>
            Incoming Webhook URL
          </label>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              border: "2px solid var(--border-color)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.85rem",
              fontFamily: "var(--font-mono)",
              outline: "none",
            }}
          />
        </div>
        {data?.organization?.slackWebhookUrl === "configured" && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--teal)" }}>
              ✓ Webhook configured
            </span>
            <button
              className="btn-ghost"
              onClick={handleTestWebhook}
              disabled={isTesting}
              style={{ fontSize: "0.8rem" }}
            >
              {isTesting ? "Sending..." : "Test Webhook"}
            </button>
            <button
              className="btn-ghost"
              onClick={async () => {
                if (!confirm("Remove the Slack webhook? You will stop receiving notifications.")) return;
                setIsSaving(true);
                try {
                  const res = await fetch(`/api/org/${slug}/settings`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ slackWebhookUrl: null }),
                  });
                  if (!res.ok) throw new Error("Failed to remove webhook");
                  queryClient.invalidateQueries({ queryKey: ["orgSettings", slug] });
                  setWebhookUrl("");
                  showToast("Webhook removed", "success");
                } catch {
                  showToast("Failed to remove webhook", "error");
                } finally {
                  setIsSaving(false);
                }
              }}
              style={{ fontSize: "0.8rem", color: "var(--error)" }}
            >
              Remove Webhook
            </button>
            <p style={{ width: "100%", fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
              Enter a new URL above and save to replace the existing webhook.
            </p>
          </div>
        )}
      </div>

      <button
        className="btn-primary"
        onClick={handleSave}
        disabled={isSaving}
        style={{ width: "100%", padding: "0.75rem" }}
      >
        {isSaving ? "Saving..." : "Save Settings"}
      </button>

      <div className="card" style={{
        marginTop: "2rem",
        border: "2px solid var(--error)",
        background: "var(--danger-zone-bg)",
      }}>
        <h3 style={{
          fontFamily: "var(--font-heading)",
          fontSize: "1.1rem",
          fontWeight: 600,
          color: "var(--error)",
          marginBottom: "0.5rem",
        }}>
          Danger Zone
        </h3>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
          Permanently delete this organization. All members will be removed, all assignments will be deleted. This action cannot be undone.
        </p>
        <button
          onClick={async () => {
            const confirmText = prompt(
              `Type "${data?.organization?.slug}" to confirm deletion:`
            );
            if (confirmText !== data?.organization?.slug) return;

            setIsDeleting(true);
            try {
              const res = await fetch(`/api/org/${slug}/settings`, {
                method: "DELETE",
                credentials: "include",
              });
              if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || "Failed to delete");
              }
              showToast("Organization deleted", "success");
              router.push("/dashboard");
            } catch (err) {
              showToast(err instanceof Error ? err.message : "Failed to delete", "error");
            } finally {
              setIsDeleting(false);
            }
          }}
          disabled={isDeleting}
          style={{
            padding: "0.625rem 1rem",
            fontSize: "0.85rem",
            background: "var(--error)",
            color: "white",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
            fontWeight: 500,
          }}
        >
          {isDeleting ? "Deleting..." : "Delete Organization"}
        </button>
      </div>
    </main>
  );
}
