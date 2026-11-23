"use client";

// Requester history — every request one employee has made, with the full record of each:
// contents, model priority + reasons, every approve / return / reject, deferral, payout and the
// activity trail. Staff-only (the backend returns 403 to employees). Used on the request detail
// page ("Name's request history", the current request left out) and on Admin → Users → History.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import { collapseRepeats } from "@/app/lib/audit";
import { formatAmount, formatDate, formatDateTime } from "@/app/lib/format";
import { PRIORITY_STYLES, TIER_ROLES, statusLabel, statusStyle } from "@/app/lib/requestStatus";
import { StatTile, EmptyState } from "@/app/components/ui/Ui";
import { FolderIcon, BanknoteIcon, XCircleIcon, InboxIcon } from "@/app/components/icons";

type Approval = { tier: number; approverName: string; decision: string; reason: string | null; decidedAt: string };
type Activity = { actor: string; action: string; loggedAt: string };
type Outcome = {
  kind: "Disbursed" | "Approved" | "Rejected" | "Returned" | "Deferred" | "Pending";
  summary: string;
  reason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
};
type HistoricalRequest = {
  requestId: number;
  category: string;
  amount: number;
  description: string | null;
  status: string;
  currentTier: number;
  validationNote: string | null;
  deferReason: string | null;
  createdAt: string;
  updatedAt: string;
  salary: number | null;
  employmentDurationMonths: number | null;
  priorityLevel: string | null;
  explanation: string | null;
  hasDocument: boolean;
  documentName: string | null;
  outcome: Outcome;
  approvals: Approval[];
  disbursement: { amount: number; reference: string | null; note: string | null; disbursedByName: string; disbursedAt: string } | null;
  activity: Activity[];
};
export type RequesterHistoryData = {
  requester: { userId: number; name: string; email: string; role: string; department: string; isActive: boolean; createdAt: string };
  summary: {
    total: number; disbursed: number; approvedAwaitingPayout: number; rejected: number; pending: number;
    totalRequested: number; totalDisbursed: number; lastRequestAt: string | null;
  };
  requests: HistoricalRequest[];
};

const OUTCOME_STYLES: Record<Outcome["kind"], string> = {
  Disbursed: "bg-low text-on-low",
  Approved: "bg-low/15 text-low-text",
  Rejected: "bg-kq-red/15 text-kq-red",
  Returned: "bg-ink-soft/15 text-ink-soft",
  Deferred: "bg-ink-soft/15 text-ink-soft",
  Pending: "bg-medium/15 text-medium-text",
};
const OUTCOME_LABELS: Record<Outcome["kind"], string> = {
  Disbursed: "Paid out",
  Approved: "Approved",
  Rejected: "Rejected",
  Returned: "Returned",
  Deferred: "Deferred",
  Pending: "In progress",
};
const DECISION_STYLES: Record<string, string> = {
  Approved: "text-low-text",
  Rejected: "text-kq-red",
  Returned: "text-ink-soft",
};

type Filter = "all" | "paid" | "rejected" | "open";
const FILTERS: { key: Filter; label: string; match: (r: HistoricalRequest) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "paid", label: "Approved / paid", match: (r) => r.outcome.kind === "Disbursed" || r.outcome.kind === "Approved" },
  { key: "rejected", label: "Rejected", match: (r) => r.outcome.kind === "Rejected" },
  { key: "open", label: "In progress", match: (r) => ["Pending", "Returned", "Deferred"].includes(r.outcome.kind) },
];

const roleForTier = (t: number) => TIER_ROLES[t - 1] ?? `Tier ${t}`;

// The model's top reasons, in a few words each (the detail page has the full explanation).
function topFactors(r: HistoricalRequest): { text: string; up: boolean | null }[] {
  if (!r.explanation || !r.priorityLevel) return [];
  let factors: { feature: string; impact: number; urgency?: number | null }[] = [];
  try { factors = JSON.parse(r.explanation); } catch { return []; }
  const label = (f: string): string | null => {
    if (f.startsWith("request_category_")) {
      const c = f.replace("request_category_", "");
      return c === r.category ? `${c} category` : null;
    }
    return ({
      requested_amount: "Requested amount",
      salary: "Salary",
      employment_duration_months: "Length of employment",
      previous_requests: "Previous requests",
      request_frequency: "Request frequency",
      has_documents: r.hasDocument ? "Documents provided" : "No documents",
    } as Record<string, string>)[f] ?? f;
  };
  return factors
    .map((f) => {
      const text = label(f.feature);
      // Same direction rule as the detail page: the model's `urgency` (toward High minus
      // toward Low) when present; older predictions fall back to the class-relative
      // impact sign, which has no up/down meaning for Medium (shown neutral).
      const up: boolean | null =
        typeof f.urgency === "number"
          ? f.urgency >= 0
          : r.priorityLevel === "High"
            ? f.impact >= 0
            : r.priorityLevel === "Low"
              ? f.impact < 0
              : null;
      return text ? { text, up } : null;
    })
    .filter((x): x is { text: string; up: boolean | null } => x !== null)
    .slice(0, 3);
}

export default function RequesterHistory({
  userId,
  excludeRequestId,
  title,
}: {
  userId: number;
  excludeRequestId?: number;   // on a request's page: leave that request out ("other requests")
  title?: string;
}) {
  const [data, setData] = useState<RequesterHistoryData | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    apiFetch<RequesterHistoryData>(`/users/${userId}/request-history`).then((r) => {
      if (cancelled) return;
      if (r.ok) setData(r.data);
      else setError(r.status === 403 ? "You don't have access to this history." : r.error);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const others = useMemo(
    () => (data?.requests ?? []).filter((r) => r.requestId !== excludeRequestId),
    [data, excludeRequestId]
  );
  const shown = others.filter(FILTERS.find((f) => f.key === filter)!.match);

  if (error) return <p className="text-sm text-kq-red">{error}</p>;
  if (!data) return <p className="text-sm text-ink-soft">Loading request history…</p>;

  const { requester, summary } = data;
  const heading = title ?? `${requester.name}'s request history`;

  return (
    <section aria-label={heading}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">{heading}</h2>
          <p className="text-sm text-ink-soft">
            {requester.role} · {requester.department} · member since {formatDate(requester.createdAt)}
            {!requester.isActive && <> · <span className="font-medium">deactivated</span></>}
          </p>
        </div>
      </div>

      {/* Totals across ALL their requests (including the one being reviewed, if any). */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Requests made" value={summary.total} icon={FolderIcon}
          hint={summary.lastRequestAt ? `Last on ${formatDate(summary.lastRequestAt)}` : undefined} />
        <StatTile label="Paid out" value={summary.disbursed} icon={BanknoteIcon} tone="text-low-text" iconTone="bg-low/15 text-low-text"
          hint={`KES ${formatAmount(summary.totalDisbursed)} in total`} />
        <StatTile label="Rejected" value={summary.rejected} icon={XCircleIcon} tone="text-kq-red" iconTone="bg-kq-red/10 text-kq-red" />
        <StatTile label="In progress" value={summary.pending + summary.approvedAwaitingPayout} icon={InboxIcon}
          tone="text-medium-text" iconTone="bg-medium/15 text-medium-text"
          hint={summary.approvedAwaitingPayout ? `${summary.approvedAwaitingPayout} approved, awaiting payout` : undefined} />
      </div>

      {others.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={FolderIcon}
            title={excludeRequestId ? "No previous requests" : "No requests yet"}
            body={excludeRequestId ? `This is ${requester.name}'s first request.` : `${requester.name} hasn't submitted any requests.`} />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter requests">
            {FILTERS.map((f) => {
              const count = others.filter(f.match).length;
              const active = filter === f.key;
              return (
                <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    active ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink hover:border-ink/40"
                  }`}>
                  {f.label} <span className={active ? "opacity-80" : "text-ink-soft"}>({count})</span>
                </button>
              );
            })}
            <button
              onClick={() => setOpen(Object.fromEntries(shown.map((r) => [r.requestId, !shown.every((x) => open[x.requestId])])))}
              className="ml-auto text-sm text-ink-soft underline-offset-2 hover:text-ink hover:underline">
              {shown.length > 0 && shown.every((x) => open[x.requestId]) ? "Collapse all" : "Expand all"}
            </button>
          </div>

          <ul className="mt-3 space-y-3">
            {shown.map((r) => (
              <HistoryCard key={r.requestId} r={r} expanded={!!open[r.requestId]}
                onToggle={() => setOpen((o) => ({ ...o, [r.requestId]: !o[r.requestId] }))} />
            ))}
            {shown.length === 0 && <li className="text-sm text-ink-soft">No requests in this group.</li>}
          </ul>
        </>
      )}
    </section>
  );
}

function HistoryCard({ r, expanded, onToggle }: { r: HistoricalRequest; expanded: boolean; onToggle: () => void }) {
  const [docError, setDocError] = useState("");
  const factors = topFactors(r);
  const activity = collapseRepeats(r.activity, (a) => `${a.actor}|${a.action}`);
  const panelId = `history-${r.requestId}`;

  async function viewDocument() {
    setDocError("");
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/requests/${r.requestId}/document`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) { setDocError("Could not open the document."); return; }
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      setDocError("Could not reach the server to open the document.");
    }
  }

  return (
    <li className="rounded-2xl border border-line bg-surface">
      {/* Summary row — always visible. */}
      {/* Phones: badges drop onto their own line under the text; wider: badges on the right. */}
      <button onClick={onToggle} aria-expanded={expanded} aria-controls={panelId}
        className="flex w-full items-start gap-3 rounded-2xl p-4 text-left transition hover:bg-canvas/50">
        <span aria-hidden className={`mt-0.5 text-ink-soft transition ${expanded ? "rotate-90" : ""}`}>▸</span>
        <span className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="min-w-0">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-ink">#{r.requestId}</span>
              <span className="text-ink">{r.category}</span>
              <span className="font-medium text-ink">KES {formatAmount(r.amount)}</span>
            </span>
            <span className="mt-0.5 block text-sm text-ink-soft">
              Submitted {formatDate(r.createdAt)} · {r.outcome.summary}
              {r.outcome.decidedAt && r.outcome.kind !== "Pending" && <> · {formatDate(r.outcome.decidedAt)}</>}
            </span>
          </span>
          <span className="flex shrink-0 flex-wrap gap-2">
            <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[r.priorityLevel ?? "Unclassified"]}`}>
              {r.priorityLevel ?? "Unclassified"}
            </span>
            <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${OUTCOME_STYLES[r.outcome.kind]}`}>
              {OUTCOME_LABELS[r.outcome.kind]}
            </span>
          </span>
        </span>
      </button>

      {expanded && (
        <div id={panelId} className="space-y-5 border-t border-line p-4 text-sm sm:p-5">
          {/* The decision reached. */}
          <div className={`rounded-xl border p-4 ${
            r.outcome.kind === "Rejected" ? "border-kq-red/30 bg-kq-red/5"
              : r.outcome.kind === "Disbursed" || r.outcome.kind === "Approved" ? "border-low/30 bg-low/10"
              : "border-line bg-canvas"}`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Decision reached</p>
            <p className="mt-1 font-medium text-ink">{r.outcome.summary}</p>
            {r.outcome.reason && <p className="mt-1 whitespace-pre-wrap text-ink">“{r.outcome.reason}”</p>}
            {(r.outcome.decidedBy || r.outcome.decidedAt) && r.outcome.kind !== "Pending" && (
              <p className="mt-1 text-xs text-ink-soft">
                {r.outcome.decidedBy && <>By {r.outcome.decidedBy}</>}
                {r.outcome.decidedBy && r.outcome.decidedAt && " · "}
                {r.outcome.decidedAt && formatDateTime(r.outcome.decidedAt)}
              </p>
            )}
          </div>

          {/* What was asked for. */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Fact label="Amount requested" value={`KES ${formatAmount(r.amount)}`} />
            <Fact label="Current status" value={statusLabel(r.status)} badge={statusStyle(r.status)} />
            <Fact label="Submitted" value={formatDateTime(r.createdAt)} />
            <Fact label="Last updated" value={formatDateTime(r.updatedAt)} />
            <Fact label="Stated salary" value={r.salary != null ? `KES ${formatAmount(r.salary)}` : "—"} />
            <Fact label="Employment" value={r.employmentDurationMonths != null ? `${r.employmentDurationMonths} months` : "—"} />
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-ink-soft">Document</dt>
              <dd className="mt-0.5">
                {r.hasDocument ? (
                  <button onClick={viewDocument} className="break-all text-left text-kq-red hover:underline">
                    {r.documentName ?? "View document"}
                  </button>
                ) : <span className="text-ink">None</span>}
                {docError && <span className="mt-1 block text-xs text-kq-red">{docError}</span>}
              </dd>
            </div>
            <Fact label="Model priority" value={r.priorityLevel ?? "Unclassified"} />
            {r.description && (
              <div className="col-span-2 sm:col-span-4">
                <dt className="text-xs font-medium uppercase tracking-wider text-ink-soft">Description</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-ink">{r.description}</dd>
              </div>
            )}
            {r.validationNote && (
              <div className="col-span-2 sm:col-span-4">
                <dt className="text-xs font-medium uppercase tracking-wider text-ink-soft">Validation note</dt>
                <dd className="mt-0.5 text-medium-text">{r.validationNote}</dd>
              </div>
            )}
            {r.deferReason && (
              <div className="col-span-2 sm:col-span-4">
                <dt className="text-xs font-medium uppercase tracking-wider text-ink-soft">Reason for deferral</dt>
                <dd className="mt-0.5 text-ink">{r.deferReason}</dd>
              </div>
            )}
          </dl>

          {factors.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Main reasons for the priority</p>
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {factors.map((f) => (
                  <li key={f.text} className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-xs text-ink">
                    {f.text} <span className={f.up === null ? "text-medium-text" : f.up ? "text-high" : "text-low-text"}>{f.up === null ? "• rating" : f.up ? "↑ higher" : "↓ lower"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Every approver decision, in order. */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Approval decisions</p>
            {r.approvals.length === 0 ? (
              <p className="mt-1 text-ink-soft">No approver has acted on this request.</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {r.approvals.map((a, i) => (
                  <li key={i} className="rounded-xl border border-line p-3">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className={`font-semibold ${DECISION_STYLES[a.decision] ?? "text-ink"}`}>{a.decision}</span>
                      <span className="text-ink">by {a.approverName}</span>
                      <span className="text-ink-soft">({roleForTier(a.tier)})</span>
                      <span className="ml-auto text-xs text-ink-soft">{formatDateTime(a.decidedAt)}</span>
                    </p>
                    {a.reason && (
                      <p className="mt-1 whitespace-pre-wrap text-ink-soft">
                        {a.decision === "Approved" ? "Note: " : "Reason: "}{a.reason}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {r.disbursement && (
            <div className="rounded-xl border border-low/30 bg-low/10 p-4">
              <p className="font-medium text-low-text">Paid out: KES {formatAmount(r.disbursement.amount)}</p>
              <p className="mt-1 text-ink-soft">
                By {r.disbursement.disbursedByName} (Finance) on {formatDateTime(r.disbursement.disbursedAt)}
                {r.disbursement.reference && <> · Reference: {r.disbursement.reference}</>}
              </p>
              {r.disbursement.note && <p className="mt-1 text-ink-soft">Internal note: {r.disbursement.note}</p>}
            </div>
          )}

          {/* The whole audit trail, repeated system lines grouped (×N). */}
          {activity.length > 0 && (
            <details className="group rounded-xl border border-line">
              <summary className="cursor-pointer select-none px-3 py-2 text-ink-soft hover:text-ink">
                Full activity log ({r.activity.length} {r.activity.length === 1 ? "entry" : "entries"})
              </summary>
              <ol className="space-y-1.5 border-t border-line px-3 py-2">
                {activity.map((g, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2 text-xs">
                    <span className="text-ink-soft">{formatDateTime(g.first.loggedAt)}</span>
                    <span className="font-medium text-ink">{g.first.actor}</span>
                    <span className="text-ink">{g.first.action}</span>
                    {g.count > 1 && (
                      <span className="text-ink-soft">×{g.count} (until {formatDateTime(g.last.loggedAt)})</span>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}

          <div>
            <Link href={`/requests/${r.requestId}`} className="font-medium text-kq-red hover:underline">
              Open request #{r.requestId} →
            </Link>
          </div>
        </div>
      )}
    </li>
  );
}

function Fact({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-ink-soft">{label}</dt>
      <dd className="mt-0.5">
        {badge ? <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold leading-snug ${badge}`}>{value}</span>
               : <span className="text-ink">{value}</span>}
      </dd>
    </div>
  );
}
