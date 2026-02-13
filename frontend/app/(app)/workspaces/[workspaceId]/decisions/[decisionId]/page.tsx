"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api";

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

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs text-neutral-700">
      {children}
    </span>
  );
}

function coerceStatus(v: string | undefined): StatusValue {
  const x = (v ?? "").trim() as StatusValue;
  return (STATUS_OPTIONS as readonly string[]).includes(x) ? x : "proposed";
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
        <div className="text-lg font-semibold text-neutral-900">{title}</div>
        {description ? (
          <div className="mt-1 text-sm text-neutral-600">{description}</div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            disabled={busy}
            className="rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
            onClick={onCancel}
          >
            Cancel
          </button>

          <button
            disabled={busy}
            className={[
              "rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50",
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-neutral-900 hover:bg-neutral-800",
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

  // Add revision state
  const [revOpen, setRevOpen] = useState(false);
  const [revText, setRevText] = useState("");
  const [revSaving, setRevSaving] = useState(false);
  const [revError, setRevError] = useState<string | null>(null);

  // Edit state
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

    const nextDecision: Decision = {
      ...decision,
      title: editTitle.trim() || decision.title,
      status: editStatus,
    };

    const nextDetails: DecisionDetails = {
      ...details,
      context: editContext,
      final_decision: editFinal,
      rationale: editRationale,
    };

    const prevDecision = decision;
    const prevDetails = details;

    setEditSaving(true);
    setEditError(null);

    // optimistic update
    setDecision(nextDecision);
    setDetails(nextDetails);

    try {
      const [updatedDecision, updatedDetails] = await Promise.all([
        apiPost(`/decisions/${decisionId}`, {
          title: nextDecision.title,
          status: nextDecision.status,
        }) as Promise<Decision>,
        apiPost(`/decisions/${decisionId}/details`, {
          context: nextDetails.context,
          final_decision: nextDetails.final_decision,
          rationale: nextDetails.rationale,
        }) as Promise<DecisionDetails>,
      ]);

      setDecision(updatedDecision);
      setDetails(updatedDetails);
      setEditOpen(false);
    } catch (e: any) {
      // rollback
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
      await apiPost(`/decisions/${decisionId}/options/${optionId}/choose`, {});
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
          await apiPost(
            `/decisions/${decisionId}/options/${optionId}/delete`,
            {},
          );
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
          await apiPost(
            `/decisions/${decisionId}/revisions/${revId}/delete`,
            {},
          );
        } catch (e) {
          setRevisions(prev);
          throw e;
        }
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
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/workspaces/${workspaceId}/decisions`}
          className="text-sm text-neutral-500 hover:text-neutral-700"
        >
          ← Back to decisions
        </Link>

        <div className="flex items-center gap-2">
          <button
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
            onClick={openEdit}
            disabled={loading || !!error || !decision || !details}
          >
            Edit
          </button>

          <button
            className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            onClick={() => {
              setRevError(null);
              setRevText("");
              setRevOpen(true);
            }}
          >
            + Add revision
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            {pageTitle}
          </h1>
          {decision?.status && <Pill>{decision.status}</Pill>}
          <Pill>ID: {decisionId}</Pill>
        </div>
        <p className="mt-1 text-sm text-neutral-600">
          Context, options considered, final decision, and history.
        </p>
      </div>

      {loading ? (
        <div className="mt-6 space-y-4">
          <div className="h-24 animate-pulse rounded-xl border border-neutral-200 bg-white" />
          <div className="h-24 animate-pulse rounded-xl border border-neutral-200 bg-white" />
          <div className="h-40 animate-pulse rounded-xl border border-neutral-200 bg-white" />
        </div>
      ) : error ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="text-sm font-semibold text-neutral-900">
              Details
            </div>
            <div className="mt-4 grid gap-4">
              <div>
                <div className="text-xs font-medium text-neutral-500">
                  Context
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">
                  {details?.context || "—"}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-neutral-500">
                  Final decision
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">
                  {details?.final_decision || "—"}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-neutral-500">
                  Rationale
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">
                  {details?.rationale || "—"}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-neutral-900">
                Options
              </div>
              <button
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
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
              <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                {addOptionError && (
                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {addOptionError}
                  </div>
                )}

                <div className="grid gap-3">
                  <input
                    autoFocus
                    placeholder="Option title"
                    value={optName}
                    onChange={(e) => setOptName(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                  />

                  <div className="grid gap-3 md:grid-cols-2">
                    <textarea
                      placeholder="Pros (optional)"
                      value={optPros}
                      onChange={(e) => setOptPros(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                    />
                    <textarea
                      placeholder="Cons (optional)"
                      value={optCons}
                      onChange={(e) => setOptCons(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      disabled={addingOptionSaving}
                      className="rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
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
                      className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
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
                          const msg = e?.message ?? "Failed to add option";
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
                      {addingOptionSaving ? "Adding…" : "Add option"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {chooseError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {chooseError}
              </div>
            )}

            <div className="mt-4 grid gap-3">
              {options.map((o) => (
                <div
                  key={o.id}
                  className="rounded-lg border border-neutral-200 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-neutral-900">
                      {o.option_name}
                    </div>

                    <div className="flex items-center gap-2">
                      {o.is_chosen ? <Pill>Chosen</Pill> : <Pill>Option</Pill>}

                      {!o.is_chosen && (
                        <button
                          disabled={chooseSavingId === o.id}
                          className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
                          onClick={() => chooseOption(o.id)}
                        >
                          {chooseSavingId === o.id ? "Choosing…" : "Choose"}
                        </button>
                      )}

                      <button
                        className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                        onClick={() => requestDeleteOption(o.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-xs font-medium text-neutral-500">
                        Pros
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">
                        {o.pros || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-neutral-500">
                        Cons
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">
                        {o.cons || "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="text-sm font-semibold text-neutral-900">
              History
            </div>

            {revisions.length === 0 ? (
              <div className="mt-4 text-sm text-neutral-600">
                No revisions yet.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {revisions.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-neutral-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-neutral-900">
                        {r.summary}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-xs text-neutral-500">
                          {r.created_at
                            ? new Date(r.created_at).toLocaleString()
                            : ""}
                        </div>
                        <button
                          className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                          onClick={() => requestDeleteRevision(r.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      Author: {r.author_id}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

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
            <h2 className="text-lg font-semibold text-neutral-900">
              Edit decision
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
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
                  <div className="mb-1 text-xs font-medium text-neutral-600">
                    Title
                  </div>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <div className="mb-1 text-xs font-medium text-neutral-600">
                    Status
                  </div>
                  <select
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(coerceStatus(e.target.value))
                    }
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  Context
                </div>
                <textarea
                  value={editContext}
                  onChange={(e) => setEditContext(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  Final decision
                </div>
                <input
                  value={editFinal}
                  onChange={(e) => setEditFinal(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-neutral-600">
                  Rationale
                </div>
                <textarea
                  value={editRationale}
                  onChange={(e) => setEditRationale(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                disabled={editSaving}
                className="rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </button>

              <button
                disabled={editSaving || !editTitle.trim()}
                className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                onClick={saveEdit}
              >
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <h2 className="text-lg font-semibold text-neutral-900">
              Add revision
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
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
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                disabled={revSaving}
                className="rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
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
                className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
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
                {revSaving ? "Adding…" : "Add revision"}
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
