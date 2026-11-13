"use client";

// Admin → Activity (was the "Activity" tab). The audit trail across all requests (latest 100
// entries), consecutive identical lines grouped (lib/audit.ts), filterable, paged.

import { useEffect, useState } from "react";
import { apiFetch } from "@/app/lib/api";
import type { AuditEntry } from "@/app/lib/admin";
import { collapseRepeats } from "@/app/lib/audit";
import AdminOnly from "@/app/components/admin/AdminOnly";
import ActivityList from "@/app/components/admin/ActivityList";
import { PageHeader } from "@/app/components/ui/Ui";

const PAGE = 15;

export default function AdminActivityPage() {
  return (
    <AdminOnly>
      <ActivityInner />
    </AdminOnly>
  );
}

function ActivityInner() {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    apiFetch<AuditEntry[]>("/admin/audit").then((r) => {
      setLoaded(true);
      if (r.ok) setAudit(r.data);
      else setError(r.error);
    });
  }, []);

  // Filter first (by #request / person / text), then group consecutive identical lines — even
  // across different requests (the escalation worker writes the same line for many in one pass).
  const aq = query.trim().toLowerCase().replace(/^#/, "");
  const activity = collapseRepeats(
    audit.filter(
      (e) =>
        !aq ||
        String(e.requestId) === aq ||
        (e.actorName ?? "system").toLowerCase().includes(aq) ||
        e.action.toLowerCase().includes(aq)
    ),
    (e) => `${e.actorName ?? ""}|${e.action}`
  );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Activity" subtitle="A chronological trail of significant actions across all requests — newest first." />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }}
          placeholder="Filter by #request, person or action"
          aria-label="Filter activity"
          className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20 sm:max-w-sm"
        />
        <span className="text-sm text-ink-soft">
          {activity.length} line{activity.length === 1 ? "" : "s"} from the latest {audit.length} entries (repeats grouped)
        </span>
      </div>

      {error && <p className="mt-4 text-sm text-kq-red">{error}</p>}
      <div className="mt-4 rounded-2xl border border-line bg-surface p-6">
        {!loaded ? <p className="text-sm text-ink-soft">Loading…</p> : <ActivityList items={activity.slice(0, shown)} />}
        {activity.length > shown && (
          <button onClick={() => setShown((n) => n + PAGE)}
            className="mt-4 h-10 w-full rounded-lg border border-line text-sm font-medium text-ink transition hover:bg-canvas">
            Show more ({activity.length - shown} more)
          </button>
        )}
      </div>
    </div>
  );
}
