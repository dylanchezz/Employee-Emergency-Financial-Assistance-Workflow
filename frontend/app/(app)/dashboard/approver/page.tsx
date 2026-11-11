"use client";

// Phase 8 (UI pass): page header + icon stat tiles, priority filter chips, richer queue cards
// (submitted date + days waiting, approval stage, claim state, validation flag) with a clear primary
// "Review" action, and a compact past-decisions list. Same data and rules as before.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import AwaitingDisbursement from "@/app/components/AwaitingDisbursement";
import { useSession } from "@/app/lib/session";
import { PRIORITY_FILTERS, PRIORITY_STYLES, priorityOf, statusLabel, statusStyle } from "@/app/lib/requestStatus";
import { CheckCircleIcon, FlagIcon, InboxIcon } from "@/app/components/icons";   // Phase 8
import { LOGIN_PATH } from "@/app/lib/auth";
import { daysSince, formatAgo, formatAmount, formatDate } from "@/app/lib/format";
import { EmptyState, PageHeader, SectionTitle, StatTile, TierProgress } from "@/app/components/ui/Ui";

type QueueItem = {
  requestId: number;
  requesterName: string;
  category: string;
  amount: number;
  status: string;
  currentTier: number;
  claimedBy: number | null;
  myClaimCount: number;
  priorityLevel: string | null;
  validationNote: string | null;
  createdAt: string;
};

// Mirror of the backend's ClaimPolicy.MaxClaimsPerApprover (display threshold only;
// the backend is the real enforcer).
const CLAIM_CAP = 2;
const DECIDED_INITIAL = 5;

// Priority → the coloured left bar that makes urgency visible down the list.
const PRIORITY_BAR: Record<string, string> = {
  High: "border-l-high",
  Medium: "border-l-medium",
  Low: "border-l-low",
};

// Status pill colours/labels now come from the shared lib/requestStatus (Phase 3).

// Read the current user's id from the JWT's "sub" claim.
function currentUserId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    const n = Number(payload.sub ?? payload.nameid);
    return Number.isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

type Filter = "All" | (typeof PRIORITY_FILTERS)[number];

export default function ApproverDashboard() {
  const router = useRouter();
  // Phase 3: name/role from the shared session hook (the shell already guards sign-in).
  const { name, role } = useSession();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [decided, setDecided] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [showAllDecided, setShowAllDecided] = useState(false);

  const myId = currentUserId();

  useEffect(() => {
    (async () => {
      const result = await apiFetch<QueueItem[]>("/requests/queue");
      setLoading(false);
      if (!result.ok) {
        if (result.status === 401) {
          router.replace(LOGIN_PATH);
          return;
        }
        setError(result.error);
        return;
      }
      setQueue(result.data);

      const decidedResult = await apiFetch<QueueItem[]>("/requests/my-decisions");
      if (decidedResult.ok) {
        setDecided(decidedResult.data);
      }
    })();
  }, [router]);

  const countOf = (p: Filter) => (p === "All" ? queue.length : queue.filter((q) => priorityOf(q.priorityLevel) === p).length);
  const mine = queue.filter((q) => q.claimedBy != null && q.claimedBy === myId).length;
  const visible = queue.filter((q) => filter === "All" || priorityOf(q.priorityLevel) === filter);
  const decidedShown = showAllDecided ? decided : decided.slice(0, DECIDED_INITIAL);

  return (
    // Phase 3: content inside the AppShell — the header controls (bell, 2FA, Sign out) moved to
    // the shell's navbar / the Profile page; the shell provides the <main>.
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Review queue" subtitle={<>{name} · {role}</>} />

      {/* Summary — how much is waiting, by urgency. */}
      {!loading && !error && (
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Awaiting review" value={queue.length} icon={InboxIcon} iconTone="bg-kq-red/10 text-kq-red" hint="In your queue now" />
          <StatTile label="High priority" value={countOf("High")} tone="text-kq-red" onClick={() => setFilter("High")} hint="Most urgent first" />
          <StatTile label="Medium / Low" value={`${countOf("Medium")} / ${countOf("Low")}`} onClick={() => setFilter("All")} />
          <StatTile label="Claimed by you" value={`${mine} / ${CLAIM_CAP}`} icon={CheckCircleIcon} iconTone="bg-low/15 text-low-text" hint="Claim limit per officer" />
        </div>
      )}

      <section className="mt-8">
        <SectionTitle title="Requests awaiting your review" subtitle="Ordered by predicted priority — most urgent first." />

        {queue.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by priority">
            {(["All", ...PRIORITY_FILTERS] as Filter[]).map((p) => {
              const n = countOf(p);
              const on = filter === p;
              return (
                <button key={p} onClick={() => setFilter(p)} aria-pressed={on} disabled={n === 0 && p !== "All"}
                  className={`flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition disabled:opacity-40 ${
                    on ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink hover:bg-canvas"
                  }`}>
                  {p === "All" ? <span className="font-medium">All</span>
                    : <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[p]}`}>{p}</span>}
                  <span className="font-semibold">{n}</span>
                </button>
              );
            })}
          </div>
        )}

        {loading && (
          <div className="mt-4 space-y-3" aria-hidden>
            {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-line bg-surface" />)}
          </div>
        )}
        {error && <p className="mt-6 text-sm text-kq-red">{error}</p>}

        {!loading && !error && queue.length === 0 && (
          <div className="mt-4">
            <EmptyState icon={CheckCircleIcon} title="You're all caught up" body="No requests are awaiting your review right now. New ones appear here, most urgent first." />
          </div>
        )}

        {visible.length > 0 && (
          <div className="mt-4 space-y-3">
            {visible.map((item, idx) => {
              const overCap = item.myClaimCount >= CLAIM_CAP;
              const claimedByOther = item.claimedBy != null && item.claimedBy !== myId;
              const claimedByMe = item.claimedBy != null && item.claimedBy === myId;
              const waited = daysSince(item.createdAt);
              const p = priorityOf(item.priorityLevel);

              return (
                <div
                  key={item.requestId}
                  style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}   /* Phase 8 (Part D) */
                  className={`animate-fade-up rounded-2xl border border-line border-l-4 bg-surface p-5 transition ${
                    PRIORITY_BAR[p] ?? "border-l-line"
                  } ${overCap && !claimedByMe ? "opacity-60" : "hover:border-kq-red/40 hover:shadow-sm"}`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[p]}`}>{p}</span>
                        <span className="font-semibold text-ink">{item.category}</span>
                        <span className="text-sm text-ink-soft">#{item.requestId}</span>
                        {item.status === "Deferred" && (
                          <span className="rounded-full bg-ink-soft/15 px-2 py-0.5 text-xs font-semibold text-ink-soft">Deferred</span>
                        )}
                        {claimedByMe && (
                          <span className="rounded-full bg-low/15 px-2 py-0.5 text-xs font-semibold text-low-text">Claimed by you</span>
                        )}
                        {claimedByOther && (
                          <span className="rounded-full bg-ink-soft/15 px-2 py-0.5 text-xs font-semibold text-ink-soft">Already claimed</span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm text-ink">
                        {item.requesterName} · <span className="font-semibold">KES {formatAmount(item.amount)}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        Submitted {formatDate(item.createdAt)} ·{" "}
                        <span className={waited >= 7 ? "font-medium text-kq-red" : ""}>{formatAgo(item.createdAt)}</span>
                      </p>
                      <div className="mt-2"><TierProgress tier={item.currentTier} /></div>
                      {item.validationNote && (
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-medium/10 px-2 py-1 text-xs text-medium-text">
                          <FlagIcon className="shrink-0" /> {item.validationNote}
                        </p>
                      )}
                    </div>

                    {overCap && !claimedByMe ? (
                      <span className="shrink-0 self-start rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-soft">
                        Claim limit reached
                      </span>
                    ) : (
                      <button
                        onClick={() => router.push(`/requests/${item.requestId}`)}
                        className={`h-10 shrink-0 self-start rounded-lg px-5 text-sm font-medium transition ${
                          claimedByMe ? "bg-kq-red text-white hover:bg-kq-red-deep" : "border border-kq-red text-kq-red hover:bg-kq-red hover:text-white"
                        }`}
                      >
                        {claimedByMe ? "Continue review" : "Review"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* D2: Finance only — the post-approval payout step, a separate panel from the
          tier-3 review queue above. */}
      {role === "Finance Officer" && (
        // id = the sidebar's "Awaiting disbursement" anchor (/dashboard/approver#disbursement).
        <div id="disbursement" className="scroll-mt-20">
          <AwaitingDisbursement myId={myId} />
        </div>
      )}

      {decided.length > 0 && (
        <section className="mt-10">
          <SectionTitle title="Your past decisions" subtitle="Requests you have acted on, with their current status." />
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {decidedShown.map((item) => (
              <li key={item.requestId}>
                <button
                  onClick={() => router.push(`/requests/${item.requestId}`)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-3 text-left transition hover:bg-canvas/60"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-sm text-ink-soft">#{item.requestId}</span>
                    <span className="font-medium text-ink">{item.category}</span>
                    {item.priorityLevel && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[item.priorityLevel] ?? "bg-line text-ink-soft"}`}>
                        {item.priorityLevel}
                      </span>
                    )}
                    <span className="text-xs text-ink-soft">{formatDate(item.createdAt)}</span>
                  </span>
                  <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {decided.length > DECIDED_INITIAL && (
            <button onClick={() => setShowAllDecided((s) => !s)}
              className="mt-3 h-10 w-full rounded-lg border border-line text-sm font-medium text-ink transition hover:bg-canvas">
              {showAllDecided ? "Show fewer" : `Show all ${decided.length}`}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
