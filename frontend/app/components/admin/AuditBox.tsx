"use client";

// Phase 6 (F2 + F6) — one request's audit trail, inline in its own box, with a CSV download.
//
// The repeat problem (backlog G5): under the 1-minute demo window, a request stuck at HR gets the same
// "Escalation: awaiting HR…" row on every escalation pass — hundreds of them. Rows are therefore
// COLLAPSED: consecutive entries with the same action and actor become ONE line "×N, first → last".
// Nothing is hidden: the count and the time span are shown, and the CSV has every row.

import { useEffect, useState } from "react";
import { apiFetch, downloadFile } from "../../lib/api";

type AuditRow = { logId: number; loggedAt: string; actor: string; action: string };
type Collapsed = { key: number; actor: string; action: string; first: string; last: string; count: number };

function collapse(rows: AuditRow[]): Collapsed[] {
  const out: Collapsed[] = [];
  for (const r of rows) {
    const prev = out[out.length - 1];
    if (prev && prev.action === r.action && prev.actor === r.actor) {
      prev.count += 1;
      prev.last = r.loggedAt;
    } else {
      out.push({ key: r.logId, actor: r.actor, action: r.action, first: r.loggedAt, last: r.loggedAt, count: 1 });
    }
  }
  return out;
}

const when = (iso: string) => new Date(iso).toLocaleString();

export default function AuditBox({ requestId }: { requestId: number }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    apiFetch<AuditRow[]>(`/admin/requests/${requestId}/audit`).then((res) => {
      if (res.ok) setRows(res.data);
      else setError(res.error);
    });
  }, [requestId]);

  async function download() {
    setDownloadError((await downloadFile(`/admin/requests/${requestId}/audit.csv`, `request-${requestId}-audit.csv`)) ?? "");
  }

  if (error) return <p className="mt-3 text-sm text-kq-red">Couldn&apos;t load the audit trail: {error}</p>;
  if (!rows) return <p className="mt-3 text-sm text-ink-soft">Loading audit trail…</p>;

  const lines = collapse(rows);
  return (
    <div className="mt-3 rounded-xl border border-line bg-canvas/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
          Audit trail · {rows.length} entr{rows.length === 1 ? "y" : "ies"}
          {lines.length < rows.length && ` (repeats collapsed to ${lines.length} lines)`}
        </p>
        <button onClick={download}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-canvas">
          Download audit (CSV)
        </button>
      </div>
      {downloadError && <p className="mt-2 text-xs text-kq-red">{downloadError}</p>}
      {lines.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No audit entries for this request.</p>
      ) : (
        <ol className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
          {lines.map((l) => (
            <li key={l.key} className="text-sm">
              <span className="text-ink">{l.action}</span>
              {l.count > 1 && (
                <span className="ml-1.5 rounded-full bg-medium/15 px-2 py-0.5 text-xs font-semibold text-medium">×{l.count}</span>
              )}
              <span className="block text-xs text-ink-soft">
                {l.actor} · {l.count > 1 ? `${when(l.first)} → ${when(l.last)}` : when(l.first)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
