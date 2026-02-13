import { supabase } from "@/lib/supabaseClient";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

async function authHeaders(extra?: Record<string, string>) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token;

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra ?? {}),
  };
}

async function apiRequest(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: any,
) {
  const url = `${API_BASE}${path}`;

  const headers = await authHeaders(
    body !== undefined ? { "Content-Type": "application/json" } : undefined,
  );

  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error: ${res.status} ${url} ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export function apiGet(path: string) {
  return apiRequest("GET", path);
}

export function apiPost(path: string, body?: any) {
  return apiRequest("POST", path, body);
}

// (we’ll use these soon)
export function apiPatch(path: string, body?: any) {
  return apiRequest("PATCH", path, body);
}

export function apiDelete(path: string) {
  return apiRequest("DELETE", path);
}
