"use client";

// Phase 6 (F1 + F2) — "Needs your attention", reorganised. Same items as before (A19: requests stuck
// at HR — keyed on a recorded escalation — or deferred too long), now:
//  F1  grouped by the request's predicted priority, High → Medium → Low (→ Unclassified), with a count
//      per group, so the most urgent stuck requests are seen first;
//  F2  each item can open its own audit box (AuditBox) inline, with a CSV download.
// Moved out of the admin page (with the reminder-email "nudge") so that page stays manageable.
//
// Phase 8 (UI pass) — the 17 big cards made the admin Overview very long. Now: the priority counts
// are filter chips, each stuck request is ONE compact row (sorted most-urgent first), and only the
// first few rows show until "Show all". Status pills use the shared statusStyle (contrast-fixed).

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { PRIORITY_FILTERS, PRIORITY_STYLES, priorityOf, statusLabel, statusStyle } from "../../lib/requestStatus";
import AuditBox from "./AuditBox";
import { formatAmount, formatDate } from "@/app/lib/format";

type AttentionItem = {
  requestId: number;
  requesterName: string;
  category: string;
  amount: number;
  status: string;
  currentTier: number;
  since: string;
  officerName: string | null;
  officerEmail: string | null;
  priorityLevel: string | null;
};

type Filter = "All" | (typeof PRIORITY_FILTERS)[number];
const INITIAL_ROWS = 6;

// Whole days since a date (for "waiting 8 days").
function daysSince(iso: string): number {
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export default function AttentionPanel() {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loadError, setLoadError] = useState("");
  const [openAudit, setOpenAudit] = useState<Record<number, boolean>>({});
  const [nudgeMsg, setNudgeMsg] = useState<Record<number, string>>({});
  const [nudgingId, setNudgingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    apiFetch<AttentionItem[]>("/admin/attention").then((res) => {
      if (res.ok) setItems(res.data);
      else setLoadError(res.error);
    });
  }, []);

  async function nudge(requestId: number) {
    setNudgingId(requestId);
    setNudgeMsg((m) => ({ ...m, [requestId]: "" }));
    const result = await apiFetch<{ message: string }>(`/admin/attention/${requestId}/nudge`, { method: "POST" });
    setNudgingId(null);
    setNudgeMsg((m) => ({ ...m, [requestId]: result.ok ? result.data.message : result.error }));
  }

  if (loadError) {
    return <p className="mt-8 text-sm text-kq-red">Couldn&apos;t load the attention list: {loadError}</p>;
  }
  if (items.length === 0) {
    return (
      <section className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">Needs your attention</h2>
        <p className="mt-1 text-sm text-ink-soft">Nothing is stuck right now — no request is overdue at HR or deferred too long.</p>
      </section>
    );
  }

  const countOf = (p: Filter) => (p === "All" ? items.length : items.filter((i) => priorityOf(i.priorityLevel) === p).length);
  // F1: most urgent first (High → … → Unclassified), then longest-waiting first.
  const rank = (i: AttentionItem) => PRIORITY_FILTERS.indexOf(priorityOf(i.priorityLevel) as (typeof PRIORITY_FILTERS)[number]);
  const rows = items
    .filter((i) => filter === "All" || priorityOf(i.priorityLevel) === filter)
    .sort((a, b) => rank(a) - rank(b) || new Date(a.since).getTime() - new Date(b.since).getTime());
  const visible = showAll ? rows : rows.slice(0, INITIAL_ROWS);

  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
          Needs your attention
          <span className="ml-2 rounded-full bg-kq-red/10 px-2 py-0.5 align-middle text-xs font-semibold text-kq-red">{items.length}</span>
        </h2>
        <p className="text-sm text-ink-soft">Stuck at HR beyond the response window, or deferred too long.</p>
      </div>

      {/* F1: the priority counts double as filters. */}
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by priority">
        {(["All", ...PRIORITY_FILTERS] as Filter[]).map((p) => {
          const n = countOf(p);
          const on = filter === p;
          return (
            <button
              key={p}
              onClick={() => { setFilter(p); setShowAll(false); }}
              aria-pressed={on}
              disabled={n === 0}
              className={`flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition disabled:opacity-40 ${
                on ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink hover:bg-canvas"
              }`}
            >
              {p === "All" ? (
                <span className="font-medium">All</span>
              ) : (
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[p]}`}>{p}</span>
              )}
              <span className="font-semibold">{n}</span>
            </button>
          );
        })}
      </div>

      <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
        {visible.map((a) => {
          const p = priorityOf(a.priorityLevel);
          const days = daysSince(a.since);
          return (
            <li key={a.requestId} className="animate-fade-up px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[p]}`}>{p}</span>
                    <Link href={`/requests/${a.requestId}`} className="font-medium text-ink hover:text-kq-red hover:underline">
                      #{a.requestId} · {a.requesterName}
                    </Link>
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle(a.status)}`}>
                      {statusLabel(a.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">
                    {a.category} · KES {formatAmount(a.amount)} · waiting since {formatDate(a.since)}
                    <span className={`ml-1 font-medium ${days >= 7 ? "text-kq-red" : "text-ink"}`}>
                      ({days} day{days === 1 ? "" : "s"})
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {a.officerName
                      ? `Responsible officer: ${a.officerName}${a.officerEmail ? ` (${a.officerEmail})` : ""}`
                      : "Unclaimed in the HR queue — no officer has taken it."}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    onClick={() => setOpenAudit((o) => ({ ...o, [a.requestId]: !o[a.requestId] }))}
                    aria-expanded={!!openAudit[a.requestId]}
                    className="h-9 rounded-lg border border-line px-3 text-xs font-medium text-ink transition hover:bg-canvas"
                  >
                    {openAudit[a.requestId] ? "Hide audit" : "Audit trail"}
                  </button>
                  {a.officerName && (
                    <button
                      onClick={() => nudge(a.requestId)}
                      disabled={nudgingId === a.requestId}
                      className="h-9 rounded-lg border border-kq-red px-3 text-xs font-medium text-kq-red transition hover:bg-kq-red hover:text-white disabled:opacity-60"
                    >
                      {nudgingId === a.requestId ? "Sending…" : "Send reminder"}
                    </button>
                  )}
                </div>
              </div>
              {nudgeMsg[a.requestId] && <p className="mt-2 text-xs text-ink-soft" role="status">{nudgeMsg[a.requestId]}</p>}
              {/* F2: loaded only when opened (some stuck requests have hundreds of rows). */}
              {openAudit[a.requestId] && <AuditBox requestId={a.requestId} />}
            </li>
          );
        })}
      </ul>

      {rows.length > INITIAL_ROWS && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="mt-3 h-10 w-full rounded-lg border border-line text-sm font-medium text-ink transition hover:bg-canvas"
        >
          {showAll ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}
