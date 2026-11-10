"use client";

// Phase 3 — C3 "Your previous requests", split into All / Accepted / Rejected. The data already
// exists (/requests/mine) — this is client-side filtering only, no backend change. "Accepted"
// includes Disbursed (approved AND paid, D2). The view is in the URL (?view=accepted|rejected) so
// the sidebar sub-items link straight to it. Works for approvers too (A7/C8: their OWN requests).

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import {
  isAccepted,
  isRejected,
  PRIORITY_STYLES,
  statusLabel,
  statusStyle,
  type MyRequest,
} from "@/app/lib/requestStatus";

const VIEWS = [
  { key: "all", label: "All", href: "/my-requests" },
  { key: "accepted", label: "Accepted", href: "/my-requests?view=accepted" },
  { key: "rejected", label: "Rejected", href: "/my-requests?view=rejected" },
] as const;

export default function MyRequestsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <MyRequests />
    </Suspense>
  );
}

function MyRequests() {
  const view = useSearchParams().get("view") ?? "all";
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<MyRequest[]>("/requests/mine").then((res) => {
      setLoaded(true);
      if (res.ok) setRequests(res.data);
      else setError(res.error);
    });
  }, []);

  const shown = requests.filter((r) =>
    view === "accepted" ? isAccepted(r.status) : view === "rejected" ? isRejected(r.status) : true
  );
  const counts: Record<string, number> = {
    all: requests.length,
    accepted: requests.filter((r) => isAccepted(r.status)).length,
    rejected: requests.filter((r) => isRejected(r.status)).length,
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">My requests</h1>

      <div className="mt-5 flex gap-2" role="tablist">
        {VIEWS.map((v) => (
          <Link key={v.key} href={v.href} role="tab" aria-selected={view === v.key}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              view === v.key ? "bg-kq-red text-white" : "border border-line bg-surface text-ink hover:bg-canvas"
            }`}>
            {v.label} <span className="opacity-75">({counts[v.key]})</span>
          </Link>
        ))}
      </div>

      {!loaded && <p className="mt-6 text-ink-soft">Loading…</p>}
      {error && <p className="mt-6 text-sm text-kq-red">{error}</p>}
      {loaded && !error && shown.length === 0 && (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-10 text-center text-sm text-ink-soft">
          {view === "accepted" ? "No accepted requests yet." : view === "rejected" ? "No rejected requests." : "You haven't submitted any requests yet."}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {shown.map((r) => (
          <Link key={r.requestId} href={`/requests/${r.requestId}`}
            className="flex w-full items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5 transition hover:border-kq-red/40">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">#{r.requestId}</span>
                <span className="text-ink">{r.category}</span>
                {r.priorityLevel && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[r.priorityLevel] ?? "bg-ink-soft text-white"}`}>
                    {r.priorityLevel}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                KES {r.amount.toLocaleString()} · submitted {new Date(r.createdAt).toLocaleDateString()}
              </p>
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
