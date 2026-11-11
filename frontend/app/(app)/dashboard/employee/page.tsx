"use client";

// Employee dashboard — Phase 3: now CONTENT inside the shared AppShell (sidebar + navbar). The
// header, Sign out, bell, 2FA toggle and account-deletion card moved out: navigation/sign-out to
// the shell, 2FA + deletion to /profile (C1). The full request list moved to /my-requests (C3) and
// in-flight tracking to /track (C5); this page is the overview.
//
// Phase 8 (UI pass): two-column layout on desktop (activity left, allowance + guide right), icon
// stat tiles, richer recent-request rows (submitted date, stage indicator) and a real empty state.

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
import { formatAgo, formatAmount, formatDate } from "@/app/lib/format";
import { EmptyState, PageHeader, SectionTitle, StatTile, TierProgress } from "@/app/components/ui/Ui";
import { CheckCircleIcon, FolderIcon, PlusIcon, RouteIcon, XCircleIcon } from "@/app/components/icons";

const GUIDE = [
  { title: "Submit", body: "Describe the emergency, the amount and attach documents." },
  { title: "Checks + priority", body: "Policy rules run and the model ranks urgency, with the reasons." },
  { title: "Four approvals", body: "Supervisor → Welfare → Finance → HR, each a person's decision." },
  { title: "Paid out", body: "Finance records the disbursement; you're notified at every step." },
];

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
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Dashboard"
        subtitle="Your welfare requests at a glance."
        actions={
          <Link href="/requests/new"
            className="flex h-11 items-center gap-2 rounded-lg bg-kq-red px-5 font-medium text-white shadow-sm transition hover:bg-kq-red-deep">
            <PlusIcon size={18} /> New request
          </Link>
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Left: activity */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* At-a-glance counts, each linking to the matching view. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile href="/track" label="In progress" value={counts.inProgress} icon={RouteIcon}
              tone="text-medium-text" iconTone="bg-medium/15 text-medium-text" hint="Being reviewed now" />
            <StatTile href="/my-requests?view=accepted" label="Accepted" value={counts.accepted} icon={CheckCircleIcon}
              tone="text-low-text" iconTone="bg-low/15 text-low-text" hint="Approved or paid" />
            <StatTile href="/my-requests?view=rejected" label="Rejected" value={counts.rejected} icon={XCircleIcon}
              tone="text-kq-red" iconTone="bg-kq-red/10 text-kq-red" hint="Not approved" />
          </div>

          <section>
            <SectionTitle
              title="Recent requests"
              subtitle="Your five most recent requests."
              right={requests.length > 0 && (
                <Link href="/my-requests" className="text-sm font-medium text-kq-red hover:underline">View all →</Link>
              )}
            />

            {!loaded && (
              <div className="mt-4 space-y-3" aria-hidden>
                {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl border border-line bg-surface" />)}
              </div>
            )}
            {error && <p className="mt-4 text-sm text-kq-red">{error}</p>}
            {loaded && !error && requests.length === 0 && (
              <div className="mt-4">
                <EmptyState
                  icon={FolderIcon}
                  title="No requests yet"
                  body="When you submit an emergency assistance request, you'll be able to follow it here, step by step."
                  action={<Link href="/requests/new" className="inline-flex h-10 items-center rounded-lg bg-kq-red px-4 text-sm font-medium text-white transition hover:bg-kq-red-deep">Start a request</Link>}
                />
              </div>
            )}

            <div className="mt-4 space-y-3">
              {requests.slice(0, 5).map((r, i) => (
                <Link
                  key={r.requestId}
                  href={`/requests/${r.requestId}`}
                  style={{ animationDelay: `${i * 40}ms` }}   /* Phase 8 (Part D): subtle stagger */
                  className="group flex w-full animate-fade-up items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5 transition hover:border-kq-red/40 hover:shadow-sm"
                >
                  {/* min-w-0 + wrap so a long category can't push the status pill off a 390px screen. */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink group-hover:text-kq-red">{r.category}</span>
                      {r.priorityLevel && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[r.priorityLevel] ?? "bg-line text-ink-soft"}`}>
                          {r.priorityLevel}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-ink-soft">
                      #{r.requestId} · KES {formatAmount(r.amount)} · submitted {formatDate(r.createdAt)} ({formatAgo(r.createdAt)})
                    </p>
                    {r.status === "In Review" && <div className="mt-2"><TierProgress tier={r.currentTier} /></div>}
                  </div>
                  <span className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(r.status)}`}>
                    {statusLabel(r.status)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* Right: allowance + how it works */}
        <aside className="space-y-6">
          {/* Phase 5 (E1): how many requests they have left — before they start a new one. */}
          <RequestStatsCard />
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-[family-name:var(--font-heading)] text-base font-semibold text-ink">How your request moves</h2>
            <ol className="mt-4 space-y-4">
              {GUIDE.map((g, i) => (
                <li key={g.title} className="flex gap-3">
                  <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-kq-red/10 text-xs font-bold text-kq-red">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">{g.title}</p>
                    <p className="text-xs leading-relaxed text-ink-soft">{g.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link href="/track" className="mt-4 inline-block text-sm font-medium text-kq-red hover:underline">Track a request →</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
