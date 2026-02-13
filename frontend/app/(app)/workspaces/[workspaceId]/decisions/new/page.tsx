"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiPost, apiPut } from "@/lib/api";

type Status = "proposed" | "in_review" | "approved" | "deprecated";

type Option = {
  option_name: string;
  pros: string;
  cons: string;
  is_chosen: boolean;
};

function statusLabel(s: Status) {
  if (s === "approved") return "Decided";
  if (s === "proposed") return "Proposed";
  if (s === "in_review") return "Revised";
  if (s === "deprecated") return "Deprecated";
  return s;
}

export default function NewDecisionPage() {
  const params = useParams<{ workspaceId?: string | string[] }>();
  const router = useRouter();

  const workspaceIdRaw = params.workspaceId;
  const workspaceId = Array.isArray(workspaceIdRaw)
    ? workspaceIdRaw[0]
    : workspaceIdRaw;

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Status>("proposed");
  const [owner, setOwner] = useState("Demo User"); // UI-only for now
  const [context, setContext] = useState("");
  const [finalDecision, setFinalDecision] = useState("");
  const [rationale, setRationale] = useState("");

  const [options, setOptions] = useState<Option[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = useMemo(
    () => title.trim().length > 0 && !!workspaceId,
    [title, workspaceId],
  );

  function addOption() {
    setOptions((prev) => [
      ...prev,
      { option_name: "", pros: "", cons: "", is_chosen: false },
    ]);
  }

  function removeOption(idx: number) {
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateOption(idx: number, patch: Partial<Option>) {
    setOptions((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
    );
  }

  async function onSave() {
    if (!canSave) return;

    setSaving(true);
    setError(null);

    try {
      // 1) Create the decision row (so it shows in the list)
      const created = (await apiPost(`/workspaces/${workspaceId}/decisions`, {
        title: title.trim(),
        summary: context.trim() || null, // your list uses summary
        // If your backend supports status on create, uncomment:
        // status,
      })) as { id: string };

      // 2) Create details row (so /details won't 404)
      await apiPut(`/decisions/${created.id}/details`, {
        context: context.trim() || "",
        final_decision: finalDecision.trim() || "",
        rationale: rationale.trim() || "",
      });

      // 3) Create options (optional but you said you want them to show right away)
      for (const o of options) {
        const name = o.option_name.trim();
        if (!name) continue;

        await apiPost(`/decisions/${created.id}/options`, {
          option_name: name,
          pros: o.pros.trim() || null,
          cons: o.cons.trim() || null,
          is_chosen: !!o.is_chosen,
        });
      }

      // 4) Go to the detail page (now it will load clean)
      router.push(`/workspaces/${workspaceId}/decisions/${created.id}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save decision");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB]">
      {/* Header */}
      <div className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-8 py-6">
          <button
            onClick={() => router.push(`/workspaces/${workspaceId}/decisions`)}
            className="text-[#6B7280] hover:text-[#111827]"
            aria-label="Back"
          >
            ←
          </button>
          <h1 className="text-2xl font-bold text-[#111827]">New Decision</h1>
        </div>
      </div>

      {/* Form */}
      <div className="mx-auto max-w-5xl px-8 py-8">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-[#E5E7EB] bg-white p-8">
          {/* Decision Title */}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-[#111827]">
              Decision Title <span className="text-red-600">*</span>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Choose database for user service"
              className="w-full rounded-lg border border-[#E5E7EB] px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Status + Owner */}
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-[#111827]">Status</div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className="w-full rounded-lg border border-[#E5E7EB] bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="proposed">{statusLabel("proposed")}</option>
                <option value="in_review">{statusLabel("in_review")}</option>
                <option value="approved">{statusLabel("approved")}</option>
                <option value="deprecated">{statusLabel("deprecated")}</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-[#111827]">Owner</div>
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full rounded-lg border border-[#E5E7EB] px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          {/* Problem Context */}
          <div className="mt-6 space-y-2">
            <div className="text-sm font-semibold text-[#111827]">
              Problem Context
            </div>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Describe the problem or situation that requires a decision..."
              rows={5}
              className="w-full rounded-lg border border-[#E5E7EB] px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Options Considered */}
          <div className="mt-8 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-[#111827]">
                Options Considered
              </div>
              <button
                type="button"
                onClick={addOption}
                className="inline-flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#111827] hover:bg-neutral-50"
              >
                <span className="text-lg leading-none">＋</span> Add Option
              </button>
            </div>

            {options.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#E5E7EB] p-8 text-center text-sm text-[#6B7280]">
                No options added yet. Click "Add Option" to document
                alternatives.
              </div>
            ) : (
              <div className="space-y-4">
                {options.map((o, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-[#E5E7EB] p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                      <input
                        value={o.option_name}
                        onChange={(e) =>
                          updateOption(idx, { option_name: e.target.value })
                        }
                        placeholder="Option name"
                        className="w-full flex-1 rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                      />

                      <label className="flex items-center gap-2 text-sm text-[#111827]">
                        <input
                          type="checkbox"
                          checked={o.is_chosen}
                          onChange={(e) =>
                            updateOption(idx, { is_chosen: e.target.checked })
                          }
                        />
                        Selected
                      </label>

                      <button
                        type="button"
                        onClick={() => removeOption(idx)}
                        className="text-sm font-medium text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <div className="mb-1 text-xs font-semibold text-green-600">
                          Pros
                        </div>
                        <textarea
                          value={o.pros}
                          onChange={(e) =>
                            updateOption(idx, { pros: e.target.value })
                          }
                          rows={3}
                          placeholder="Benefits of this option..."
                          className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-semibold text-red-600">
                          Cons
                        </div>
                        <textarea
                          value={o.cons}
                          onChange={(e) =>
                            updateOption(idx, { cons: e.target.value })
                          }
                          rows={3}
                          placeholder="Drawbacks of this option..."
                          className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Final Decision */}
          <div className="mt-8 space-y-2">
            <div className="text-sm font-semibold text-[#111827]">
              Final Decision
            </div>
            <textarea
              value={finalDecision}
              onChange={(e) => setFinalDecision(e.target.value)}
              placeholder="What was decided? Provide a clear summary..."
              rows={4}
              className="w-full rounded-lg border border-[#E5E7EB] px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Rationale */}
          <div className="mt-6 space-y-2">
            <div className="text-sm font-semibold text-[#111827]">
              Rationale
            </div>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why was this decision made? What factors were considered?..."
              rows={5}
              className="w-full rounded-lg border border-[#E5E7EB] px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Actions */}
          <div className="mt-8 flex justify-end gap-3">
            <button
              type="button"
              onClick={() =>
                router.push(`/workspaces/${workspaceId}/decisions`)
              }
              className="rounded-lg border border-[#E5E7EB] bg-white px-5 py-2.5 text-sm font-medium text-[#111827] hover:bg-neutral-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={!canSave || saving}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Decision"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
