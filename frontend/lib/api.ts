import { supabase } from "@/lib/supabaseClient";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

type RequestOpts = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

// Coalesce duplicate inflight requests (esp GET spam)
const inflight = new Map<string, Promise<any>>();

/**
 * Supabase can return null session on hard refresh for a brief moment
 * while it rehydrates from storage. DevTools "fixing it" is a classic sign.
 */
async function waitForSession(timeoutMs = 1500) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) return session;

    // small delay then retry
    await new Promise((r) => setTimeout(r, 75));
  }

  return null;
}

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
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: any,
  opts?: RequestOpts,
) {
  const url = `${API_BASE}${path}`;
  const timeoutMs = opts?.timeoutMs ?? 12000;

  // ✅ KEY for dedupe
  const key =
    method === "GET"
      ? `${method} ${url}`
      : `${method} ${url} ${body !== undefined ? JSON.stringify(body) : ""}`;

  // ✅ Dedup GET spam: reuse inflight promise
  if (method === "GET" && inflight.has(key)) {
    return inflight.get(key)!;
  }

  const run = (async () => {
    const headers = await authHeaders(
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
    );

    // Optional: HARD fail if you require auth for everything
    // if (!headers.Authorization) {
    //   throw new Error(`API error: 401 ${url} (missing session token)`);
    // }

    // Merge AbortControllers: one for timeout, one optional external signal
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const onAbort = () => controller.abort();
    if (opts?.signal) opts.signal.addEventListener("abort", onAbort);

    console.trace("[API]", method, url);

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
      if (err?.name === "AbortError") {
        throw new Error(`API timeout/abort → ${method} ${url}`);
      }
      throw new Error(`Network error → ${method} ${url}`);
    } finally {
      clearTimeout(timeout);
      if (opts?.signal) opts.signal.removeEventListener("abort", onAbort);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");

      // Nice error message for auth
      if (res.status === 401) {
        throw new Error(`API error: 401 Unauthorized ${url}`);
      }

      throw new Error(`API error: ${res.status} ${url} ${text}`);
    }

    if (res.status === 204) return null;

    const text = await res.text().catch(() => "");
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  })();

  if (method === "GET") inflight.set(key, run);

  try {
    return await run;
  } finally {
    if (method === "GET") inflight.delete(key);
  }
}

// Public helpers (now accept opts)
export function apiGet(path: string, opts?: RequestOpts) {
  return apiRequest("GET", path, undefined, opts);
}

export function apiPost(path: string, body?: any, opts?: RequestOpts) {
  return apiRequest("POST", path, body, opts);
}

export function apiPut(path: string, body?: any, opts?: RequestOpts) {
  return apiRequest("PUT", path, body, opts);
}

export function apiPatch(path: string, body?: any, opts?: RequestOpts) {
  return apiRequest("PATCH", path, body, opts);
}

export function apiDelete(path: string, opts?: RequestOpts) {
  return apiRequest("DELETE", path, undefined, opts);
}
