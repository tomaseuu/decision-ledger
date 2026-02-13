import { supabase } from "@/lib/supabaseClient";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

// =============================
// Auth Headers
// =============================
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

// =============================
// Core Request Handler
// =============================
async function apiRequest(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: any,
) {
  const url = `${API_BASE}${path}`;

  const headers = await authHeaders(
    body !== undefined ? { "Content-Type": "application/json" } : undefined,
  );

  // 🔥 Add timeout protection (prevents "Working..." freeze)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  console.log("[API]", method, url, body ?? null);

  let res: Response;

  try {
    res = await fetch(url, {
      method,
      cache: "no-store",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeout);

    if (err?.name === "AbortError") {
      throw new Error(`API timeout after 12s → ${method} ${url}`);
    }

    throw new Error(`Network error → ${method} ${url}`);
  } finally {
    clearTimeout(timeout);
  }

  // 🔥 Handle non-OK responses
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error: ${res.status} ${url} ${text}`);
  }

  // 204 No Content
  if (res.status === 204) return null;

  // 🔥 Safely handle empty body (prevents JSON crash)
  const text = await res.text().catch(() => "");

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// =============================
// Public Helpers
// =============================
export function apiGet(path: string) {
  return apiRequest("GET", path);
}

export function apiPost(path: string, body?: any) {
  return apiRequest("POST", path, body);
}

export function apiPut(path: string, body?: any) {
  return apiRequest("PUT", path, body);
}

export function apiPatch(path: string, body?: any) {
  return apiRequest("PATCH", path, body);
}

export function apiDelete(path: string) {
  return apiRequest("DELETE", path);
}
