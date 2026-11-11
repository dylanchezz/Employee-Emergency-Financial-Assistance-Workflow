"use client";

// Employee dashboard — Phase 3: now CONTENT inside the shared AppShell (sidebar + navbar). The
// header, Sign out, bell, 2FA toggle and account-deletion card moved out: navigation/sign-out to
// the shell, 2FA + deletion to /profile (C1). The full request list moved to /my-requests (C3) and
// in-flight tracking to /track (C5); this page is the overview.

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import RequestStatsCard from "@/app/components/RequestStatsCard";
import {
  isAccepted,
  isInProgress,
  isRejected,
  PRIORITY_STYLES,
  statusLabel,
  statusStyle,
  type MyRequest,
} from "@/app/lib/requestStatus";

export default function EmployeeDashboard() {
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<MyRequest[]>("/requests/mine").then((result) => {
      setLoaded(true);
      if (result.ok) setRequests(result.data);
      else setError(result.error);
    });
  }, []);

  const counts = {
    inProgress: requests.filter((r) => isInProgress(r.status)).length,
    accepted: requests.filter((r) => isAccepted(r.status)).length,
    rejected: requests.filter((r) => isRejected(r.status)).length,
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">Dashboard</h1>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-6">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">Need assistance?</h2>
          <p className="mt-1 text-sm text-ink-soft">Submit an emergency financial assistance request.</p>
        </div>
        <Link
          href="/requests/new"
          className="rounded-lg bg-kq-red px-5 py-2.5 font-medium text-white transition hover:bg-kq-red-deep"
        >
          + New request
        </Link>
      </div>

      {/* Phase 5 (E1): how many requests they have left — before they start a new one. */}
      <div className="mt-6">
        <RequestStatsCard />
      </div>

      {/* At-a-glance counts, each linking to the matching view. */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <SummaryTile href="/track" label="In progress" value={counts.inProgress} tone="text-medium" />
        <SummaryTile href="/my-requests?view=accepted" label="Accepted" value={counts.accepted} tone="text-low" />
        <SummaryTile href="/my-requests?view=rejected" label="Rejected" value={counts.rejected} tone="text-kq-red" />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">Recent requests</h2>
        {requests.length > 0 && (
          <Link href="/my-requests" className="text-sm font-medium text-kq-red hover:underline">
            View all →
          </Link>
        )}
      </div>

      {!loaded && <p className="mt-4 text-ink-soft">Loading…</p>}
      {error && <p className="mt-4 text-sm text-kq-red">{error}</p>}
      {loaded && !error && requests.length === 0 && (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="font-medium text-ink">No requests yet.</p>
          <p className="mt-1 text-sm text-ink-soft">When you submit a request, it will appear here.</p>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {requests.slice(0, 5).map((r) => (
          <Link
            key={r.requestId}
            href={`/requests/${r.requestId}`}
            className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface p-5 transition hover:border-kq-red/40"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink">#{r.requestId}</span>
                <span className="text-ink">{r.category}</span>
                {r.priorityLevel && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[r.priorityLevel] ?? "bg-ink-soft text-white"}`}>
                    {r.priorityLevel}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-soft">KES {r.amount.toLocaleString()}</p>
            </div>
            <span className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(r.status)}`}>
              {statusLabel(r.status)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SummaryTile({ href, label, value, tone }: { href: string; label: string; value: number; tone: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-line bg-surface p-4 transition hover:border-kq-red/40">
      <p className={`font-[family-name:var(--font-heading)] text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-sm text-ink-soft">{label}</p>
    </Link>
  );
}
