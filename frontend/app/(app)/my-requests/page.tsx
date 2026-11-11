"use client";

// Phase 3 — C3 "Your previous requests", split into All / Accepted / Rejected (client-side filtering
// of /requests/mine; "Accepted" includes Disbursed). Works for approvers too (A7/C8).
// Phase 5 — E1 the request-allowance card at the top; E4 a priority filter (High / Medium / Low /
// Unclassified). BOTH filters live in the URL (?view=…&priority=…) and COMPOSE: each link changes
// only its own parameter and keeps the other, so "Accepted + High" is one shareable URL.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import RequestStatsCard from "@/app/components/RequestStatsCard";
import {
  isAccepted,
  isRejected,
  PRIORITY_FILTERS,
  PRIORITY_STYLES,
  priorityOf,
  statusLabel,
  statusStyle,
  type MyRequest,
} from "@/app/lib/requestStatus";

const VIEWS = [
  { key: "all", label: "All" },
  { key: "accepted", label: "Accepted" },
  { key: "rejected", label: "Rejected" },
] as const;

// Build a /my-requests URL from the two filters ("all" / null = no parameter).
function hrefFor(view: string, priority: string | null) {
  const q = new URLSearchParams();
  if (view !== "all") q.set("view", view);
  if (priority) q.set("priority", priority);
  const s = q.toString();
  return s ? `/my-requests?${s}` : "/my-requests";
}

export default function MyRequestsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <MyRequests />
    </Suspense>
  );
}

function MyRequests() {
  const params = useSearchParams();
  const view = params.get("view") ?? "all";
  const priorityParam = params.get("priority");
  const priority = PRIORITY_FILTERS.find((p) => p === priorityParam) ?? null; // ignore unknown values

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

  const inView = (r: MyRequest, v: string) =>
    v === "accepted" ? isAccepted(r.status) : v === "rejected" ? isRejected(r.status) : true;
  const inPriority = (r: MyRequest, p: string | null) => !p || priorityOf(r.priorityLevel) === p;

  const shown = requests.filter((r) => inView(r, view) && inPriority(r, priority));

  // Tab counts respect the chosen priority; chip counts respect the chosen tab — so every number is
  // "what you'd see if you clicked it".
  const viewCount = (v: string) => requests.filter((r) => inView(r, v) && inPriority(r, priority)).length;
  const priorityCount = (p: string) => requests.filter((r) => inView(r, view) && inPriority(r, p)).length;

  const emptyText = () => {
    const what = view === "accepted" ? "accepted " : view === "rejected" ? "rejected " : "";
    if (priority) return `No ${what}requests with ${priority.toLowerCase()} priority.`;
    if (view === "accepted") return "No accepted requests yet.";
    if (view === "rejected") return "No rejected requests.";
    return "You haven't submitted any requests yet.";
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">My requests</h1>

      {/* E1 */}
      <div className="mt-5">
        <RequestStatsCard />
      </div>

      {/* C3 view tabs */}
      <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Outcome">
        {VIEWS.map((v) => (
          <Link key={v.key} href={hrefFor(v.key, priority)} role="tab" aria-selected={view === v.key}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              view === v.key ? "bg-kq-red text-white" : "border border-line bg-surface text-ink hover:bg-canvas"
            }`}>
            {v.label} <span className="opacity-75">({viewCount(v.key)})</span>
          </Link>
        ))}
      </div>

      {/* E4 priority filter — composes with the tab above */}
      <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Priority filter">
        <span className="text-sm text-ink-soft">Priority:</span>
        <Link href={hrefFor(view, null)} aria-pressed={!priority}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            !priority ? "bg-ink text-surface" : "border border-line bg-surface text-ink hover:bg-canvas"
          }`}>
          Any
        </Link>
        {PRIORITY_FILTERS.map((p) => (
          <Link key={p} href={hrefFor(view, priority === p ? null : p)} aria-pressed={priority === p}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              priority === p ? `${PRIORITY_STYLES[p]} ring-2 ring-ink/20` : "border border-line bg-surface text-ink hover:bg-canvas"
            }`}>
            {p} ({priorityCount(p)})
          </Link>
        ))}
      </div>

      {!loaded && <p className="mt-6 text-ink-soft">Loading…</p>}
      {error && <p className="mt-6 text-sm text-kq-red">{error}</p>}
      {loaded && !error && shown.length === 0 && (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-10 text-center text-sm text-ink-soft">
          {emptyText()}
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
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[priorityOf(r.priorityLevel)]}`}>
                  {priorityOf(r.priorityLevel)}
                </span>
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
