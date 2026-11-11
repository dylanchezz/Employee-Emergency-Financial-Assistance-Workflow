"use client";

// Phase 6 (F1 + F2) — "Needs your attention", reorganised. Same items as before (A19: requests stuck
// at HR — keyed on a recorded escalation — or deferred too long), now:
//  F1  grouped by the request's predicted priority, High → Medium → Low (→ Unclassified), with a count
//      per group, so the most urgent stuck requests are seen first;
//  F2  each item can open its own audit box (AuditBox) inline, with a CSV download.
// Moved out of the admin page (with the reminder-email "nudge") so that page stays manageable.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { PRIORITY_FILTERS, PRIORITY_STYLES, priorityOf } from "../../lib/requestStatus";
import AuditBox from "./AuditBox";

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

export default function AttentionPanel() {
  const router = useRouter();
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loadError, setLoadError] = useState("");
  const [openAudit, setOpenAudit] = useState<Record<number, boolean>>({});
  const [nudgeMsg, setNudgeMsg] = useState<Record<number, string>>({});
  const [nudgingId, setNudgingId] = useState<number | null>(null);

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
  if (items.length === 0) return null;

  // F1: group by priority, in urgency order; a group appears only if it has items.
  const groups = PRIORITY_FILTERS.map((p) => ({ priority: p, items: items.filter((i) => priorityOf(i.priorityLevel) === p) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mt-8">
      <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-ink">Needs your attention</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Requests stuck at HR beyond the response window, or deferred too long — grouped by predicted priority.
      </p>

      {/* F1 summary: one count per priority */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PRIORITY_FILTERS.map((p) => {
          const n = items.filter((i) => priorityOf(i.priorityLevel) === p).length;
          return (
            <div key={p} className={`rounded-xl border border-line bg-surface p-3 ${n === 0 ? "opacity-50" : ""}`}>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[p]}`}>{p}</span>
              <p className="mt-2 font-[family-name:var(--font-heading)] text-2xl font-bold text-ink">{n}</p>
            </div>
          );
        })}
      </div>

      {groups.map((g) => (
        <section key={g.priority} className="mt-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[g.priority]}`}>{g.priority}</span>
            {g.items.length} request{g.items.length === 1 ? "" : "s"}
          </h3>
          <div className="mt-3 space-y-3">
            {g.items.map((a) => (
              <div key={a.requestId} className="rounded-2xl border border-medium/50 bg-surface p-4">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/requests/${a.requestId}`)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(`/requests/${a.requestId}`); }}
                  className="cursor-pointer"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-medium text-ink">Request #{a.requestId} · {a.requesterName}</span>
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-medium px-2.5 py-0.5 text-xs font-semibold text-white">{a.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">
                    {a.category} · KES {a.amount.toLocaleString()} · waiting since {new Date(a.since).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {a.officerName
                      ? `Responsible officer: ${a.officerName}${a.officerEmail ? ` (${a.officerEmail})` : ""}`
                      : "Unclaimed in the HR queue — no officer has taken it."}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setOpenAudit((o) => ({ ...o, [a.requestId]: !o[a.requestId] }))}
                    aria-expanded={!!openAudit[a.requestId]}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-canvas"
                  >
                    {openAudit[a.requestId] ? "Hide audit trail" : "Show audit trail"}
                  </button>
                  {a.officerName && (
                    <button
                      onClick={() => nudge(a.requestId)}
                      disabled={nudgingId === a.requestId}
                      className="rounded-lg border border-kq-red px-3 py-1.5 text-xs font-medium text-kq-red transition hover:bg-kq-red hover:text-white disabled:opacity-60"
                    >
                      {nudgingId === a.requestId ? "Sending…" : "Send reminder email"}
                    </button>
                  )}
                  {nudgeMsg[a.requestId] && <span className="text-xs text-ink-soft">{nudgeMsg[a.requestId]}</span>}
                </div>

                {/* F2: loaded only when opened (some stuck requests have hundreds of rows). */}
                {openAudit[a.requestId] && <AuditBox requestId={a.requestId} />}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
