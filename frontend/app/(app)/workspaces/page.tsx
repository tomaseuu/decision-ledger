"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";

type Workspace = {
  id: string;
  name: string;
  created_at?: string;
  decision_count?: number;
  updated_at?: string;
};

export default function WorkspacesPage() {
  const router = useRouter();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // create modal state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function loadWorkspaces() {
    setLoading(true);
    setError(null);

    try {
      const data = (await apiGet("/workspaces")) as Workspace[];
      setWorkspaces(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!alive) return;
      await loadWorkspaces();
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/auth/sign-in");
    router.refresh();
  }

  function openCreate() {
    setCreateError(null);
    setNewName("");
    setDialogOpen(true);
  }

  async function createWorkspace() {
    const name = newName.trim();
    if (!name) {
      setCreateError("Workspace name is required.");
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      // Assumption: backend accepts { name } and returns { id, name, ... }
      const created = (await apiPost("/workspaces", { name })) as Workspace;

      setDialogOpen(false);
      setNewName("");

      // reload list so it appears
      await loadWorkspaces();

      // OPTIONAL: auto-enter the workspace like a “timeline” flow
      if (created?.id) {
        router.push(`/workspaces/${created.id}/decisions`);
      }
    } catch (e: any) {
      const msg = e?.message ?? "Failed to create workspace";
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB]">
      {/* Top header (matches screenshot vibe) */}
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto max-w-4xl px-8 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 hover:opacity-80"
          >
            <div className="h-9 w-9 rounded-lg border border-[#E5E7EB] bg-white flex items-center justify-center font-semibold text-sm">
              DL
            </div>
            <span className="text-sm font-semibold text-[#111827]">
              Decision Ledger
            </span>
          </Link>

          <button
            onClick={logout}
            className="text-sm text-[#6B7280] hover:text-[#111827]"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-4xl px-8 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">
            Select a Workspace
          </h1>
          <p className="mt-3 text-base text-neutral-600">
            Choose a workspace to continue, or create a new one.
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-6">
            <div className="h-20 animate-pulse rounded-2xl bg-neutral-200" />
            <div className="h-20 animate-pulse rounded-2xl bg-neutral-200" />
            <div className="h-20 animate-pulse rounded-2xl bg-neutral-200" />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && workspaces.length === 0 && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
            <div className="text-lg font-medium text-neutral-900">
              No workspaces yet
            </div>
            <p className="mt-2 text-sm text-neutral-500">
              Create your first workspace to start tracking decisions.
            </p>
          </div>
        )}

        {/* Workspace Cards */}
        {!loading && !error && workspaces.length > 0 && (
          <div className="space-y-6">
            {workspaces.map((w) => (
              <Link
                key={w.id}
                href={`/workspaces/${w.id}/decisions`}
                className="group flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-6 py-6 shadow-sm transition hover:border-neutral-300"
              >
                <div>
                  <div className="text-lg font-semibold text-neutral-900">
                    {w.name}
                  </div>

                  <div className="mt-2 flex items-center gap-3 text-sm text-neutral-500">
                    <span>{w.decision_count ?? 0} decisions</span>
                    <span className="text-neutral-300">•</span>
                    <span>
                      Updated{" "}
                      {w.updated_at
                        ? new Date(w.updated_at).toLocaleDateString()
                        : "—"}
                    </span>
                  </div>
                </div>

                <div className="text-neutral-400 transition group-hover:text-neutral-600">
                  →
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Create Workspace Button */}
        <button
          onClick={openCreate}
          className="mt-10 flex w-full items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white py-4 text-sm font-medium text-neutral-700 shadow-sm hover:border-neutral-300"
        >
          <span className="text-lg">+</span>
          Create Workspace
        </button>
      </main>

      {/* Modal */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (creating) return;
              setDialogOpen(false);
            }}
          />

          <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl border border-[#E5E7EB]">
            <div className="px-6 py-5 flex items-center justify-between">
              <div className="text-xl font-semibold text-[#111827]">
                Create New Workspace
              </div>
              <button
                onClick={() => {
                  if (creating) return;
                  setDialogOpen(false);
                }}
                className="text-neutral-400 hover:text-neutral-700 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="px-6 pb-6">
              <label className="block text-sm font-medium text-[#111827]">
                Workspace Name
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Team's Workspace"
                className="mt-2 w-full rounded-lg border border-[#E5E7EB] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                autoFocus
                disabled={creating}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!creating) createWorkspace();
                  }
                }}
              />

              {createError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {createError}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setDialogOpen(false)}
                  disabled={creating}
                  className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#111827] hover:bg-[#F3F4F6] disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  onClick={createWorkspace}
                  disabled={creating || !newName.trim()}
                  className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
