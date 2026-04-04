export function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export async function ensureCsrfToken(): Promise<string> {
  let token = getCsrfToken();
  if (token) return token;
  const res = await fetch("/api/csrf-token");
  const data = await res.json();
  return data.csrfToken || "";
}

export async function csrfFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const method = init?.method?.toUpperCase() || "GET";
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return fetch(url, init);
  }
  const token = await ensureCsrfToken();
  const headers = new Headers(init?.headers);
  headers.set("x-csrf-token", token);
  return fetch(url, { ...init, headers });
}
