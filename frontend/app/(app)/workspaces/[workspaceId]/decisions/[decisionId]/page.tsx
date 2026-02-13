"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";

type Decision = {
  id: string;
  workspace_id?: string;
  title: string;
  status: string;
  owner_id?: string;
  created_at?: string;
  updated_at?: string;
};

type DecisionDetails = {
  decision_id: string;
  context: string;
  final_decision: string;
  rationale: string;
};

type DecisionOption = {
  id: string;
  decision_id: string;
  option_name: string;
  pros: string | null;
  cons: string | null;
  is_chosen: boolean;
  created_at?: string;
};

type Revision = {
  id: string;
  author_id: string;
  summary: string;
  created_at?: string;
};

const STATUS_OPTIONS = [
  "proposed",
  "in_review",
  "approved",
  "deprecated",
] as const;
type StatusValue = (typeof STATUS_OPTIONS)[number];

function coerceStatus(v: string | undefined): StatusValue {
  const x = (v ?? "").trim() as StatusValue;
  return (STATUS_OPTIONS as readonly string[]).includes(x) ? x : "proposed";
}

function formatDate(dateString?: string) {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(s: string) {
  const v = (s || "proposed").toLowerCase();
  if (v === "approved") return "Decided";
  if (v === "in_review") return "Revised";
  if (v === "deprecated") return "Deprecated";
  return "Proposed";
}

function StatusBadge({ status }: { status: string }) {
  const v = (status || "proposed").toLowerCase();
  const cls =
    v === "approved"
      ? "border-[#16A34A] bg-[#16A34A] bg-opacity-5 text-[#16A34A]"
      : v === "in_review"
        ? "border-[#F59E0B] bg-[#F59E0B] bg-opacity-5 text-[#B45309]"
        : v === "deprecated"
          ? "border-[#9CA3AF] bg-[#F3F4F6] text-[#374151]"
          : "border-[#F59E0B] bg-[#F59E0B] bg-opacity-5 text-[#B45309]";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        cls,
      ].join(" ")}
    >
      {statusLabel(v)}
    </span>
  );
}

function ConfirmModal(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const {
    open,
    title,
    description,
    confirmText = "Confirm",
    danger,
    busy,
    error,
    onCancel,
    onConfirm,
  } = props;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (busy) return;
          onCancel();
        }}
      />
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="text-lg font-semibold text-[#111827]">{title}</div>
        {description ? (
          <div className="mt-1 text-sm text-[#6B7280]">{description}</div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            disabled={busy}
            className="rounded-lg px-3 py-2 text-sm text-[#6B7280] hover:bg-neutral-100 disabled:opacity-50"
            onClick={onCancel}
          >
            Cancel
          </button>

          <button
            disabled={busy}
            className={[
              "rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50",
              danger
                ? "bg-[#DC2626] hover:bg-[#B91C1C]"
                : "bg-[#111827] hover:bg-[#0B1220]",
            ].join(" ")}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DecisionDetailPage() {
  const params = useParams<{ workspaceId: string; decisionId: string }>();
  const router = useRouter();

  const workspaceId = params.workspaceId;
  const decisionId = params.decisionId;

  const [decision, setDecision] = useState<Decision | null>(null);
  const [details, setDetails] = useState<DecisionDetails | null>(null);
  const [options, setOptions] = useState<DecisionOption[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add option state
  const [addingOption, setAddingOption] = useState(false);
  const [optName, setOptName] = useState("");
  const [optPros, setOptPros] = useState("");
  const [optCons, setOptCons] = useState("");
  const [addingOptionSaving, setAddingOptionSaving] = useState(false);
  const [addOptionError, setAddOptionError] = useState<string | null>(null);

  // Choose option state
  const [chooseSavingId, setChooseSavingId] = useState<string | null>(null);
  const [chooseError, setChooseError] = useState<string | null>(null);

  // Add revision state (from Revision History card)
  const [revOpen, setRevOpen] = useState(false);
  const [revText, setRevText] = useState("");
  const [revSaving, setRevSaving] = useState(false);
  const [revError, setRevError] = useState<string | null>(null);

  // Edit state (modal)
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState<StatusValue>("proposed");
  const [editContext, setEditContext] = useState("");
  const [editFinal, setEditFinal] = useState("");
  const [editRationale, setEditRationale] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmDesc, setConfirmDesc] = useState<string | undefined>(undefined);
  const [confirmText, setConfirmText] = useState("Confirm");
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    (() => Promise<void>) | null
  >(null);

  const pageTitle = useMemo(() => decision?.title ?? "Decision", [decision]);

  function openConfirm(args: {
    title: string;
    description?: string;
    confirmText?: string;
    danger?: boolean;
    action: () => Promise<void>;
  }) {
    setConfirmError(null);
    setConfirmTitle(args.title);
    setConfirmDesc(args.description);
    setConfirmText(args.confirmText ?? "Confirm");
    setConfirmDanger(!!args.danger);
    setConfirmAction(() => args.action);
    setConfirmOpen(true);
  }

  function closeConfirm() {
    if (confirmBusy) return;
    setConfirmOpen(false);
    setConfirmAction(null);
    setConfirmError(null);
  }

  async function runConfirm() {
    if (!confirmAction) return;
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      await confirmAction();
      setConfirmOpen(false);
      setConfirmAction(null);
    } catch (e: any) {
      const msg = e?.message ?? "Action failed";
      if (msg.includes(" 401 ") || msg.toLowerCase().includes("unauthorized")) {
        setConfirmError("You’re not signed in. Sign in to continue.");
      } else {
        setConfirmError(msg);
      }
    } finally {
      setConfirmBusy(false);
    }
  }

  function openEdit() {
    setEditError(null);
    setEditTitle(decision?.title ?? "");
    setEditStatus(coerceStatus(decision?.status));
    setEditContext(details?.context ?? "");
    setEditFinal(details?.final_decision ?? "");
    setEditRationale(details?.rationale ?? "");
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!decision || !details) return;

    // We *can* reliably save details via PUT /details
    const nextDetails: DecisionDetails = {
      ...details,
      context: editContext,
      final_decision: editFinal,
      rationale: editRationale,
    };

    const prevDecision = decision;
    const prevDetails = details;

    // Optimistic update (title/status locally)
    const nextDecision: Decision = {
      ...decision,
      title: editTitle.trim() || decision.title,
      status: editStatus,
    };

    setEditSaving(true);
    setEditError(null);
    setDecision(nextDecision);
    setDetails(nextDetails);

    try {
      // ✅ backend supports this
      const updatedDetails = (await apiPut(`/decisions/${decisionId}/details`, {
        context: nextDetails.context,
        final_decision: nextDetails.final_decision,
        rationale: nextDetails.rationale,
      })) as DecisionDetails;

      // NOTE: Your backend does NOT show an endpoint to update decision title/status.
      // So we keep it client-side for now. If you add one, I’ll wire it in.
      setDetails(updatedDetails);
      setEditOpen(false);
    } catch (e: any) {
      setDecision(prevDecision);
      setDetails(prevDetails);

      const msg = e?.message ?? "Failed to save changes";
      if (msg.includes(" 401 ") || msg.toLowerCase().includes("unauthorized")) {
        setEditError("You’re not signed in. Sign in to edit this decision.");
      } else {
        setEditError(msg);
      }
    } finally {
      setEditSaving(false);
    }
  }

  async function chooseOption(optionId: string) {
    setChooseError(null);
    setChooseSavingId(optionId);

    const prev = options;

    // optimistic local choose
    setOptions((curr) =>
      curr.map((o) => ({
        ...o,
        is_chosen: o.id === optionId,
      })),
    );

    try {
      // ✅ matches your FastAPI: PUT /options/{option_id}/choose
      await apiPut(`/options/${optionId}/choose`, {});
    } catch (e: any) {
      setOptions(prev);

      const msg = e?.message ?? "Failed to choose option";
      if (msg.includes(" 401 ") || msg.toLowerCase().includes("unauthorized")) {
        setChooseError("You’re not signed in. Sign in to choose an option.");
      } else {
        setChooseError(msg);
      }
    } finally {
      setChooseSavingId(null);
    }
  }

  function requestDeleteOption(optionId: string) {
    const opt = options.find((o) => o.id === optionId);
    openConfirm({
      title: "Delete option?",
      description: opt
        ? `This will remove “${opt.option_name}”.`
        : "This will remove the option.",
      confirmText: "Delete",
      danger: true,
      action: async () => {
        const prev = options;
        setOptions((curr) => curr.filter((o) => o.id !== optionId));

        try {
          // If you have a real delete endpoint, switch to it.
          // For now, try DELETE /decisions/{decisionId}/options/{optionId}
          await apiDelete(`/decisions/${decisionId}/options/${optionId}`);
        } catch (e) {
          setOptions(prev);
          throw e;
        }
      },
    });
  }

  function requestDeleteRevision(revId: string) {
    const rev = revisions.find((r) => r.id === revId);
    openConfirm({
      title: "Delete revision?",
      description: rev
        ? `This will remove “${rev.summary}”.`
        : "This will remove the revision.",
      confirmText: "Delete",
      danger: true,
      action: async () => {
        const prev = revisions;
        setRevisions((curr) => curr.filter((r) => r.id !== revId));

        try {
          // If you have a real delete endpoint, switch to it.
          // For now, try DELETE /decisions/{decisionId}/revisions/{revId}
          await apiDelete(`/decisions/${decisionId}/revisions/${revId}`);
        } catch (e) {
          setRevisions(prev);
          throw e;
        }
      },
    });
  }

  function requestDeleteDecision() {
    openConfirm({
      title: "Delete Decision",
      description:
        "Are you sure you want to delete this decision? This action cannot be undone.",
      confirmText: "Delete",
      danger: true,
      action: async () => {
        // ✅ You asked: “if I press delete, it should just remove it”
        // This assumes you have DELETE /decisions/{decisionId} on backend.
        await apiDelete(`/decisions/${decisionId}`);

        // Go back to decisions list immediately after delete
        router.push(`/workspaces/${workspaceId}/decisions`);
      },
    });
  }

  useEffect(() => {
    if (!workspaceId || !decisionId) return;

    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [d, det, opts, revs] = await Promise.all([
          apiGet(`/decisions/${decisionId}`) as Promise<Decision>,
          apiGet(
            `/decisions/${decisionId}/details`,
          ) as Promise<DecisionDetails>,
          apiGet(`/decisions/${decisionId}/options`) as Promise<
            DecisionOption[]
          >,
          apiGet(`/decisions/${decisionId}/revisions`) as Promise<Revision[]>,
        ]);

        if (!alive) return;

        setDecision(d);
        setDetails(det);
        setOptions(opts);
        setRevisions(revs);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load decision");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [workspaceId, decisionId]);

  return (
    <div className="min-h-screen bg-[#F8F9FB]">
      {/* Header */}
      <div className="border-b border-[#E5E7EB] bg-white px-8 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/workspaces/${workspaceId}/decisions`}
              className="text-[#6B7280] hover:text-[#111827]"
            >
              ←
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#111827]">{pageTitle}</h1>
              {decision?.status ? (
                <StatusBadge status={decision.status} />
              ) : null}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#111827] hover:bg-[#F3F4F6] disabled:opacity-50"
              onClick={openEdit}
              disabled={loading || !!error || !decision || !details}
            >
              Edit
            </button>
            <button
              className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#DC2626] hover:bg-[#DC2626] hover:text-white disabled:opacity-50"
              onClick={requestDeleteDecision}
              disabled={loading || !!error || !decision}
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-[#F8F9FB] p-8">
        <div className="mx-auto max-w-6xl">
          {loading ? (
            <div className="space-y-4">
              <div className="h-24 animate-pulse rounded-lg border border-[#E5E7EB] bg-white" />
              <div className="h-24 animate-pulse rounded-lg border border-[#E5E7EB] bg-white" />
              <div className="h-40 animate-pulse rounded-lg border border-[#E5E7EB] bg-white" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-6">
              {/* Main - 2 columns */}
              <div className="col-span-2 space-y-6">
                {/* Problem Context */}
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-6">
                  <h2 className="text-lg font-semibold text-[#111827] mb-3">
                    Problem Context
                  </h2>
                  <p className="whitespace-pre-wrap leading-relaxed text-[#111827]">
                    {details?.context || "No context provided"}
                  </p>
                </div>

                {/* Options Considered */}
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-[#111827]">
                      Options Considered
                    </h2>
                    <button
                      className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#111827] hover:bg-[#F3F4F6]"
                      onClick={() => {
                        setAddOptionError(null);
                        setChooseError(null);
                        setAddingOption(true);
                      }}
                    >
                      + Add option
                    </button>
                  </div>

                  {addingOption && (
                    <div className="mb-4 rounded-lg border border-[#E5E7EB] bg-[#F8F9FB] p-4">
                      {addOptionError && (
                        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          {addOptionError}
                        </div>
                      )}

                      <div className="grid gap-3">
                        <input
                          autoFocus
                          placeholder="Option name"
                          value={optName}
                          onChange={(e) => setOptName(e.target.value)}
                          className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                        />

                        <div className="grid gap-3 md:grid-cols-2">
                          <textarea
                            placeholder="Pros (optional)"
                            value={optPros}
                            onChange={(e) => setOptPros(e.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                          />
                          <textarea
                            placeholder="Cons (optional)"
                            value={optCons}
                            onChange={(e) => setOptCons(e.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                          />
                        </div>

                        <div className="flex justify-end gap-2">
                          <button
                            disabled={addingOptionSaving}
                            className="rounded-lg px-3 py-2 text-sm text-[#6B7280] hover:bg-[#E5E7EB] disabled:opacity-50"
                            onClick={() => {
                              setAddingOption(false);
                              setOptName("");
                              setOptPros("");
                              setOptCons("");
                              setAddOptionError(null);
                            }}
                          >
                            Cancel
                          </button>

                          <button
                            disabled={addingOptionSaving || !optName.trim()}
                            className="rounded-lg bg-[#111827] px-4 py-2 text-sm font-medium text-white hover:bg-[#0B1220] disabled:opacity-40"
                            onClick={async () => {
                              const name = optName.trim();
                              if (!name) return;

                              setAddingOptionSaving(true);
                              setAddOptionError(null);

                              try {
                                const created = (await apiPost(
                                  `/decisions/${decisionId}/options`,
                                  {
                                    option_name: name,
                                    pros: optPros.trim() || null,
                                    cons: optCons.trim() || null,
                                    is_chosen: false,
                                  },
                                )) as DecisionOption;

                                setOptions((prev) => [created, ...prev]);

                                setAddingOption(false);
                                setOptName("");
                                setOptPros("");
                                setOptCons("");
                              } catch (e: any) {
                                const msg =
                                  e?.message ?? "Failed to add option";
                                if (
                                  msg.includes(" 401 ") ||
                                  msg.toLowerCase().includes("unauthorized")
                                ) {
                                  setAddOptionError(
                                    "You’re not signed in. Sign in to add options.",
                                  );
                                } else {
                                  setAddOptionError(msg);
                                }
                              } finally {
                                setAddingOptionSaving(false);
                              }
                            }}
                          >
                            {addingOptionSaving ? "Adding..." : "Add option"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {chooseError && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {chooseError}
                    </div>
                  )}

                  {options.length === 0 ? (
                    <div className="text-sm text-[#6B7280]">
                      No options yet.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {options.map((o) => (
                        <div
                          key={o.id}
                          className={[
                            "rounded-lg border p-4",
                            o.is_chosen
                              ? "border-[#16A34A] bg-[#16A34A] bg-opacity-5"
                              : "border-[#E5E7EB]",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-[#111827]">
                                {o.option_name}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={[
                                  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                                  o.is_chosen
                                    ? "border-[#16A34A] bg-[#16A34A] bg-opacity-5 text-[#16A34A]"
                                    : "border-[#E5E7EB] bg-white text-[#374151]",
                                ].join(" ")}
                              >
                                {o.is_chosen ? "Chosen" : "Option"}
                              </span>

                              {!o.is_chosen && (
                                <button
                                  disabled={chooseSavingId === o.id}
                                  className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6] disabled:opacity-50"
                                  onClick={() => chooseOption(o.id)}
                                >
                                  {chooseSavingId === o.id
                                    ? "Choosing..."
                                    : "Choose"}
                                </button>
                              )}

                              <button
                                className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#6B7280] hover:bg-[#F3F4F6]"
                                onClick={() => requestDeleteOption(o.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm font-medium text-[#16A34A] mb-1">
                                Pros
                              </div>
                              <div className="text-sm text-[#111827] whitespace-pre-wrap">
                                {o.pros || "None listed"}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-[#DC2626] mb-1">
                                Cons
                              </div>
                              <div className="text-sm text-[#111827] whitespace-pre-wrap">
                                {o.cons || "None listed"}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Final Decision */}
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-6">
                  <h2 className="text-lg font-semibold text-[#111827] mb-3">
                    Final Decision
                  </h2>
                  <div className="rounded-lg border border-[#2563EB] border-opacity-20 bg-[#2563EB] bg-opacity-5 p-4">
                    <p className="whitespace-pre-wrap font-medium text-[#111827]">
                      {details?.final_decision || "—"}
                    </p>
                  </div>
                </div>

                {/* Rationale */}
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-6">
                  <h2 className="text-lg font-semibold text-[#111827] mb-3">
                    Rationale
                  </h2>
                  <p className="whitespace-pre-wrap leading-relaxed text-[#111827]">
                    {details?.rationale || "—"}
                  </p>
                </div>

                {/* Revision History */}
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-[#111827]">
                      Revision History
                    </h2>
                    <button
                      className="rounded-lg bg-[#111827] px-4 py-2 text-sm font-medium text-white hover:bg-[#0B1220]"
                      onClick={() => {
                        setRevError(null);
                        setRevText("");
                        setRevOpen(true);
                      }}
                    >
                      + Add revision
                    </button>
                  </div>

                  {revisions.length === 0 ? (
                    <div className="text-sm text-[#6B7280]">
                      No revisions yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {revisions.map((r, index) => (
                        <div key={r.id} className="flex gap-4">
                          <div className="relative flex flex-col items-center">
                            <div className="w-2 h-2 bg-[#2563EB] rounded-full mt-1" />
                            {index < revisions.length - 1 && (
                              <div className="w-px flex-1 bg-[#E5E7EB] mt-1" />
                            )}
                          </div>

                          <div className="flex-1 pb-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-[#111827]">
                                  Version {revisions.length - index}
                                </div>
                                <div className="text-xs text-[#6B7280] mt-0.5">
                                  {r.author_id} • {formatDate(r.created_at)}
                                </div>
                                <div className="text-sm text-[#111827] mt-1 whitespace-pre-wrap">
                                  {r.summary}
                                </div>
                              </div>

                              <button
                                className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#6B7280] hover:bg-[#F3F4F6]"
                                onClick={() => requestDeleteRevision(r.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar - 1 column */}
              <div className="space-y-6">
                <div className="rounded-lg border border-[#E5E7EB] bg-white p-6">
                  <h2 className="text-sm font-semibold text-[#111827] mb-4">
                    Metadata
                  </h2>

                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-[#6B7280] mb-1">Owner</div>
                      <div className="text-sm font-medium text-[#111827]">
                        {decision?.owner_id || "Demo User"}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-[#6B7280] mb-1">Status</div>
                      <div>
                        {decision?.status ? (
                          <StatusBadge status={decision.status} />
                        ) : (
                          "—"
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-[#6B7280] mb-1">Created</div>
                      <div className="text-sm text-[#111827]">
                        {formatDate(decision?.created_at)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-[#6B7280] mb-1">
                        Last Updated
                      </div>
                      <div className="text-sm text-[#111827]">
                        {formatDate(decision?.updated_at)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-[#6B7280] mb-1">ID</div>
                      <div className="text-sm text-[#111827] break-all">
                        {decisionId}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (editSaving) return;
              setEditOpen(false);
            }}
          />
          <div className="relative w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-[#111827]">
              Edit decision
            </h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              Update the title, status, and write-up for this decision.
            </p>

            {editError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {editError}
              </div>
            )}

            <div className="mt-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium text-[#6B7280]">
                    Title
                  </div>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>

                <div>
                  <div className="mb-1 text-xs font-medium text-[#6B7280]">
                    Status
                  </div>
                  <select
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(coerceStatus(e.target.value))
                    }
                    className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-[#6B7280]">
                  Problem Context
                </div>
                <textarea
                  value={editContext}
                  onChange={(e) => setEditContext(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-[#6B7280]">
                  Final Decision
                </div>
                <textarea
                  value={editFinal}
                  onChange={(e) => setEditFinal(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-[#6B7280]">
                  Rationale
                </div>
                <textarea
                  value={editRationale}
                  onChange={(e) => setEditRationale(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                disabled={editSaving}
                className="rounded-lg px-3 py-2 text-sm text-[#6B7280] hover:bg-[#F3F4F6] disabled:opacity-50"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </button>

              <button
                disabled={editSaving || !editTitle.trim()}
                className="rounded-lg bg-[#111827] px-4 py-2 text-sm font-medium text-white hover:bg-[#0B1220] disabled:opacity-40"
                onClick={saveEdit}
              >
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Revision Modal */}
      {revOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (revSaving) return;
              setRevOpen(false);
            }}
          />
          <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-[#111827]">
              Add revision
            </h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              Log an update to preserve decision history.
            </p>

            {revError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {revError}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <textarea
                autoFocus
                placeholder="What changed?"
                value={revText}
                onChange={(e) => setRevText(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                disabled={revSaving}
                className="rounded-lg px-3 py-2 text-sm text-[#6B7280] hover:bg-[#F3F4F6] disabled:opacity-50"
                onClick={() => {
                  setRevOpen(false);
                  setRevText("");
                  setRevError(null);
                }}
              >
                Cancel
              </button>

              <button
                disabled={revSaving || !revText.trim()}
                className="rounded-lg bg-[#111827] px-4 py-2 text-sm font-medium text-white hover:bg-[#0B1220] disabled:opacity-40"
                onClick={async () => {
                  const text = revText.trim();
                  if (!text) return;

                  setRevSaving(true);
                  setRevError(null);

                  try {
                    const created = (await apiPost(
                      `/decisions/${decisionId}/revisions`,
                      { summary: text },
                    )) as Revision;

                    setRevisions((prev) => [created, ...prev]);

                    setRevOpen(false);
                    setRevText("");
                  } catch (e: any) {
                    const msg = e?.message ?? "Failed to add revision";
                    if (
                      msg.includes(" 401 ") ||
                      msg.toLowerCase().includes("unauthorized")
                    ) {
                      setRevError(
                        "You’re not signed in. Sign in to add revisions.",
                      );
                    } else {
                      setRevError(msg);
                    }
                  } finally {
                    setRevSaving(false);
                  }
                }}
              >
                {revSaving ? "Adding..." : "Add revision"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title={confirmTitle}
        description={confirmDesc}
        confirmText={confirmText}
        danger={confirmDanger}
        busy={confirmBusy}
        error={confirmError}
        onCancel={closeConfirm}
        onConfirm={runConfirm}
      />
    </div>
  );
}
