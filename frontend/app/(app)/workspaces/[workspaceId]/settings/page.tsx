"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiDelete, apiGet, apiPut } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";

type Workspace = {
  id: string;
  name: string;
  owner_id?: string;
  members?: { id: string; name?: string; email?: string; role?: string }[];
};

type TabKey = "workspace" | "members" | "profile";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function MockWorkspace(workspaceId: string): Workspace {
  return {
    id: workspaceId,
    name: "Product Team Workspace",
    owner_id: "demo-owner",
    members: [
      { id: "1", name: "Demo User", email: "demo@user.com", role: "owner" },
      { id: "2", name: "Alex Kim", email: "alex@team.com", role: "member" },
      { id: "3", name: "Sam Lee", email: "sam@team.com", role: "member" },
    ],
  };
}

export default function WorkspaceSettingsPage() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const router = useRouter();

  const [tab, setTab] = useState<TabKey>("workspace");

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [me, setMe] = useState<{
    id: string;
    email?: string;
    name?: string;
  } | null>(null);

  // form state
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // delete dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setErr(null);

      // load user
      try {
        const { data } = await supabase.auth.getUser();
        const u = data.user;
        if (alive && u) {
          setMe({
            id: u.id,
            email: u.email ?? undefined,
            name: (u.user_metadata?.name as string) ?? undefined,
          });
        }
      } catch {
        // ignore
      }

      // load workspace (with mock fallback so you can see it now)
      try {
        const data = (await apiGet(`/workspaces/${workspaceId}`)) as Workspace;
        if (!alive) return;
        setWorkspace(data);
        setName(data?.name ?? "");
      } catch (e: any) {
        // mock fallback so UI is not blocked
        if (!alive) return;
        const mock = MockWorkspace(workspaceId);
        setWorkspace(mock);
        setName(mock.name);
        setErr("Backend not reachable — showing mock data.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  const isOwner = useMemo(() => {
    if (!workspace) return false;
    // if you don’t have owner_id yet, treat as owner in mock mode
    if (!workspace.owner_id) return true;
    if (!me) return false;
    return workspace.owner_id === me.id || workspace.owner_id === "demo-owner";
  }, [workspace, me]);

  async function onSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    if (!name.trim()) return;

    setSaving(true);
    try {
      const updated = (await apiPut(`/workspaces/${workspace.id}`, {
        name: name.trim(),
      })) as Workspace;

      // if backend returns updated workspace, use it; otherwise patch locally
      setWorkspace(updated?.id ? updated : { ...workspace, name: name.trim() });
    } catch (e) {
      // still update locally so UI feels good during dev
      setWorkspace({ ...workspace, name: name.trim() });
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteWorkspace() {
    if (!workspace) return;
    setDeleting(true);
    try {
      await apiDelete(`/workspaces/${workspace.id}`);
    } catch (e) {
      // in mock mode, just continue
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
      router.replace("/workspaces");
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-sm text-gray-500">Loading settings…</div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="p-8">
        <div className="text-sm text-red-600">Could not load workspace.</div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-0px)] bg-[#F8F9FB]">
      {/* Header */}
      <div className="border-b border-[#E5E7EB] bg-white px-8 py-6">
        <h1 className="text-4xl font-semibold tracking-tight text-[#111827]">
          Settings
        </h1>
        {err && <p className="mt-2 text-sm text-amber-700">{err}</p>}
      </div>

      {/* Content */}
      <div className="px-8 py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Tabs */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTab("workspace")}
              className={cx(
                "rounded-full px-4 py-2 text-sm font-medium transition",
                tab === "workspace"
                  ? "bg-white shadow-sm border border-[#E5E7EB]"
                  : "text-[#111827]/70 hover:text-[#111827]",
              )}
            >
              Workspace
            </button>
            <button
              onClick={() => setTab("members")}
              className={cx(
                "rounded-full px-4 py-2 text-sm font-medium transition",
                tab === "members"
                  ? "bg-white shadow-sm border border-[#E5E7EB]"
                  : "text-[#111827]/70 hover:text-[#111827]",
              )}
            >
              Members
            </button>
            <button
              onClick={() => setTab("profile")}
              className={cx(
                "rounded-full px-4 py-2 text-sm font-medium transition",
                tab === "profile"
                  ? "bg-white shadow-sm border border-[#E5E7EB]"
                  : "text-[#111827]/70 hover:text-[#111827]",
              )}
            >
              Profile
            </button>
          </div>

          {/* Panel */}
          {tab === "workspace" && (
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-8">
              <h2 className="text-2xl font-semibold text-[#111827]">
                Workspace Info
              </h2>

              <form onSubmit={onSaveName} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-[#111827]">
                    Workspace Name
                  </div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!isOwner}
                    className={cx(
                      "w-full rounded-md border border-[#E5E7EB] px-4 py-3 text-sm outline-none",
                      !isOwner && "bg-gray-50 text-gray-500",
                    )}
                    placeholder="My Workspace"
                  />
                  {!isOwner && (
                    <p className="text-xs text-[#6B7280]">
                      Only the owner can change the name.
                    </p>
                  )}
                </div>

                {isOwner && (
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center rounded-md bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                )}
              </form>

              {/* Danger Zone */}
              {isOwner && (
                <div className="mt-10 border-t border-[#E5E7EB] pt-8">
                  <h3 className="text-2xl font-semibold text-[#DC2626]">
                    Danger Zone
                  </h3>

                  <div className="mt-4 rounded-xl border border-[#DC2626] p-6">
                    <div className="flex items-start justify-between gap-6">
                      <div>
                        <div className="text-lg font-semibold text-[#111827]">
                          Delete Workspace
                        </div>
                        <div className="mt-1 text-sm text-[#6B7280]">
                          Permanently delete this workspace and all its
                          decisions. This action cannot be undone.
                        </div>
                      </div>

                      <button
                        onClick={() => setConfirmOpen(true)}
                        className="shrink-0 rounded-md border border-[#E5E7EB] px-4 py-2 text-sm font-medium text-[#DC2626] hover:bg-[#DC2626] hover:text-white"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Simple confirm modal */}
                  {confirmOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                        <div className="text-lg font-semibold text-[#111827]">
                          Delete Workspace
                        </div>
                        <p className="mt-2 text-sm text-[#6B7280]">
                          Are you sure you want to delete “{workspace.name}”?
                          This cannot be undone.
                        </p>

                        <div className="mt-6 flex justify-end gap-3">
                          <button
                            onClick={() => setConfirmOpen(false)}
                            className="rounded-md border border-[#E5E7EB] px-4 py-2 text-sm font-medium text-[#111827]"
                            disabled={deleting}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={onDeleteWorkspace}
                            className="rounded-md bg-[#DC2626] px-4 py-2 text-sm font-medium text-white hover:bg-[#B91C1C] disabled:opacity-60"
                            disabled={deleting}
                          >
                            {deleting ? "Deleting..." : "Delete Workspace"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "members" && (
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-8">
              <h2 className="text-2xl font-semibold text-[#111827]">Members</h2>

              <div className="mt-6 space-y-3">
                {(workspace.members ?? []).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between border-b border-[#E5E7EB] py-3 last:border-0"
                  >
                    <div>
                      <div className="font-medium text-[#111827]">
                        {m.name ?? m.email ?? "Unknown"}
                      </div>
                      {m.email && m.name && (
                        <div className="text-sm text-[#6B7280]">{m.email}</div>
                      )}
                    </div>
                    <div className="text-sm capitalize text-[#6B7280]">
                      {m.role ?? "member"}
                    </div>
                  </div>
                ))}

                {(!workspace.members || workspace.members.length === 0) && (
                  <div className="text-sm text-[#6B7280]">
                    No members found.
                  </div>
                )}
              </div>

              <div className="mt-8 rounded-lg border border-dashed border-[#E5E7EB] p-4 text-sm text-[#6B7280]">
                Invites/roles can be wired once your backend has member
                endpoints.
              </div>
            </div>
          )}

          {tab === "profile" && (
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-8">
              <h2 className="text-2xl font-semibold text-[#111827]">Profile</h2>

              <div className="mt-6 space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-[#111827]">Name</div>
                  <input
                    value={me?.name ?? ""}
                    disabled
                    className="w-full rounded-md border border-[#E5E7EB] bg-gray-50 px-4 py-3 text-sm text-gray-600"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-[#111827]">
                    Email
                  </div>
                  <input
                    value={me?.email ?? ""}
                    disabled
                    className="w-full rounded-md border border-[#E5E7EB] bg-gray-50 px-4 py-3 text-sm text-gray-600"
                  />
                </div>

                <p className="text-xs text-[#6B7280]">
                  Profile info is managed through your authentication provider.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
