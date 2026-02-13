"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api";

type Decision = {
  id: string;
  title: string;
  status: string;

  summary?: string | null;
  owner_name?: string | null;
  updated_at?: string | null;
};

const STATUS_OPTIONS = [
  "all",
  "proposed",
  "in_review",
  "approved",
  "deprecated",
] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

function pillText(s: string) {
  const v = (s || "proposed").toLowerCase();
  if (v === "approved") return "Decided";
  if (v === "proposed") return "Proposed";
  if (v === "in_review") return "Revised";
  if (v === "deprecated") return "Deprecated";
  return v;
}

function pillClasses(s: string) {
  const v = (s || "proposed").toLowerCase();
  if (v === "approved") return "bg-green-600 text-white";
  if (v === "proposed") return "bg-orange-500 text-white";
  if (v === "in_review") return "bg-blue-600 text-white";
  if (v === "deprecated") return "bg-neutral-700 text-white";
  return "bg-neutral-700 text-white";
}

function formatDate(d?: string | null) {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

export default function DecisionsPage() {
  const params = useParams<{ workspaceId?: string | string[] }>();
  const router = useRouter();

  const workspaceIdRaw = params.workspaceId;
  const workspaceId = Array.isArray(workspaceIdRaw)
    ? workspaceIdRaw[0]
    : workspaceIdRaw;

  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  // modal state
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const data = (await apiGet(
          `/workspaces/${workspaceId}/decisions`,
        )) as Decision[];

        if (!alive) return;
        setDecisions(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!alive) return;

        const msg = e?.message ?? "Failed to load decisions";

        if (
          msg.includes("Not a member of this workspace") ||
          msg.includes(" 403 ")
        ) {
          setError(
            "You don’t have access to this workspace (not a member). Go back and select a workspace you belong to.",
          );
        } else if (
          msg.includes(" 401 ") ||
          msg.toLowerCase().includes("unauthorized")
        ) {
          setError("You’re not signed in. Please sign in again.");
        } else {
          setError(msg);
        }
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [workspaceId]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return decisions.filter((d) => {
      const matchesStatus =
        status === "all" ? true : (d.status || "").toLowerCase() === status;

      const matchesQuery =
        query.length === 0
          ? true
          : (d.title || "").toLowerCase().includes(query);

      return matchesStatus && matchesQuery;
    });
  }, [decisions, q, status]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: decisions.length };
    for (const s of STATUS_OPTIONS) {
      if (s === "all") continue;
      map[s] = decisions.filter(
        (d) => (d.status || "").toLowerCase() === s,
      ).length;
    }
    return map as Record<StatusFilter, number>;
  }, [decisions]);

  function goToNewDecision() {
    if (!workspaceId) return;
    router.push(`/workspaces/${workspaceId}/decisions/new`);
  }

  return (
    <div className="max-w-5xl">
      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/workspaces"
            className="text-sm text-neutral-500 hover:text-neutral-700"
          >
            ← Back to workspaces
          </Link>

          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-900">
            Decisions
          </h1>
        </div>

        {/* ✅ same action as empty-state button */}
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          onClick={goToNewDecision}
        >
          <span className="text-lg leading-none">＋</span>
          New Decision
        </button>
      </div>

      {/* toolbar */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search decisions..."
          className="h-10 w-full min-w-[260px] flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400"
        />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="h-10 min-w-[180px] rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All Status" : pillText(s)} ({counts[s] ?? 0})
            </option>
          ))}
        </select>

        {/* keep UI-only if you want */}
        <select
          defaultValue="all"
          className="h-10 min-w-[180px] rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900"
        >
          <option value="all">All Owners</option>
        </select>
      </div>

      {/* main card */}
      <div className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 space-y-6">
            <div className="h-24 animate-pulse rounded-xl border border-neutral-200 bg-white" />
            <div className="h-24 animate-pulse rounded-xl border border-neutral-200 bg-white" />
            <div className="h-24 animate-pulse rounded-xl border border-neutral-200 bg-white" />
          </div>
        ) : error ? (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <div>{error}</div>
            <div className="mt-3">
              <Link
                href="/workspaces"
                className="inline-flex rounded-lg bg-white px-3 py-2 text-sm font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-50"
              >
                Go to Workspaces
              </Link>
            </div>
          </div>
        ) : decisions.length === 0 ? (
          // ✅ FIGMA-LIKE EMPTY STATE (button opens modal)
          <div className="p-10">
            <div className="rounded-2xl border border-neutral-200 bg-white px-6 py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
                <span className="text-3xl leading-none">＋</span>
              </div>

              <div className="mt-6 text-xl font-semibold text-neutral-900">
                No decisions yet
              </div>
              <div className="mt-2 text-sm text-neutral-600">
                Create your first decision to get started
              </div>

              <button
                onClick={goToNewDecision}
                className="mt-6 inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Create your first decision
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10">
            <div className="text-sm font-medium text-neutral-900">
              No matching decisions
            </div>
            <div className="mt-1 text-sm text-neutral-600">
              Try a different search or status filter.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-neutral-200">
            {filtered.map((d) => (
              <Link
                key={d.id}
                href={`/workspaces/${workspaceId}/decisions/${d.id}`}
                className="block hover:bg-neutral-50"
              >
                <div className="px-10 py-10">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="text-3xl font-semibold tracking-tight text-neutral-900">
                      {d.title}
                    </div>
                    <span
                      className={`rounded-xl px-4 py-2 text-base font-medium ${pillClasses(
                        d.status,
                      )}`}
                    >
                      {pillText(d.status)}
                    </span>
                  </div>

                  <p className="mt-4 text-xl leading-relaxed text-neutral-500">
                    {d.summary ? d.summary : "—"}
                  </p>

                  <div className="mt-4 flex items-center gap-6 text-lg text-neutral-500">
                    <span>{d.owner_name ?? "—"}</span>
                    <span className="text-neutral-300">•</span>
                    <span>{formatDate(d.updated_at) || "—"}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ===== Create Decision Modal (your current modal stays) ===== */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (creating) return;
              setOpen(false);
            }}
          />

          <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-neutral-900">
              New decision
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Capture the decision and its context.
            </p>

            {formError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <input
                autoFocus
                placeholder="Decision title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />

              <textarea
                placeholder="Summary / context (optional)"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                disabled={creating}
                className="rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
                onClick={() => {
                  if (creating) return;
                  setOpen(false);
                }}
              >
                Cancel
              </button>

              <button
                disabled={creating || !title.trim()}
                className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                onClick={async () => {
                  const t = title.trim();
                  if (!t || !workspaceId) return;

                  setCreating(true);
                  setFormError(null);

                  try {
                    const created = (await apiPost(
                      `/workspaces/${workspaceId}/decisions`,
                      { title: t, summary: summary.trim() || null },
                    )) as { id: string };

                    setOpen(false);
                    setTitle("");
                    setSummary("");

                    router.push(
                      `/workspaces/${workspaceId}/decisions/${created.id}`,
                    );
                  } catch (e: any) {
                    const msg = e?.message ?? "Failed to create decision";
                    if (
                      msg.includes("Not a member of this workspace") ||
                      msg.includes(" 403 ")
                    ) {
                      setFormError(
                        "You don’t have access to this workspace (not a member).",
                      );
                    } else if (
                      msg.includes(" 401 ") ||
                      msg.toLowerCase().includes("unauthorized")
                    ) {
                      setFormError(
                        "You’re not signed in. Sign in to create decisions.",
                      );
                    } else {
                      setFormError(msg);
                    }
                  } finally {
                    setCreating(false);
                  }
                }}
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
