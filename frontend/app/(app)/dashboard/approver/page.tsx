"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import AwaitingDisbursement from "@/app/components/AwaitingDisbursement";
import { useSession } from "@/app/lib/session";
import { statusLabel, statusStyle } from "@/app/lib/requestStatus";

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

// Priority → badge colour (using the theme status tokens).
const PRIORITY_STYLES: Record<string, string> = {
  High: "bg-high text-white",
  Medium: "bg-medium text-white",
  Low: "bg-low text-white",
};

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

export default function ApproverDashboard() {
  const router = useRouter();
  // Phase 3: name/role from the shared session hook (the shell already guards sign-in).
  const { name, role } = useSession();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [decided, setDecided] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const myId = currentUserId();

  useEffect(() => {
    (async () => {
      const result = await apiFetch<QueueItem[]>("/requests/queue");
      setLoading(false);
      if (!result.ok) {
        if (result.status === 401) {
          router.replace("/");
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

  // Counts by priority, for the summary strip.
  const counts = {
    High: queue.filter((q) => q.priorityLevel === "High").length,
    Medium: queue.filter((q) => q.priorityLevel === "Medium").length,
    Low: queue.filter((q) => q.priorityLevel === "Low").length,
  };

  return (
    // Phase 3: content inside the AppShell — the header controls (bell, 2FA, Sign out) moved to
    // the shell's navbar / the Profile page; the shell provides the <main>.
    <div className="mx-auto w-full max-w-4xl">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">
            Review queue
          </h1>
          <p className="mt-1 text-ink-soft">
            {name} · {role}
          </p>
        </div>

        {/* Summary strip — how much is waiting, by urgency. */}
        {!loading && !error && queue.length > 0 && (
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-high" />
                <span className="text-sm text-ink-soft">High priority</span>
              </div>
              <p className="mt-2 font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">
                {counts.High}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-medium" />
                <span className="text-sm text-ink-soft">Medium</span>
              </div>
              <p className="mt-2 font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">
                {counts.Medium}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-low" />
                <span className="text-sm text-ink-soft">Low</span>
              </div>
              <p className="mt-2 font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">
                {counts.Low}
              </p>
            </div>
          </div>
        )}

        <h2 className="mt-10 font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
          Requests awaiting your review
        </h2>
        <p className="text-sm text-ink-soft">Ordered by predicted priority — most urgent first.</p>

        {loading && <p className="mt-6 text-ink-soft">Loading…</p>}
        {error && <p className="mt-6 text-sm text-kq-red">{error}</p>}

        {!loading && !error && queue.length === 0 && (
          <div className="mt-6 rounded-2xl border border-line bg-surface p-10 text-center">
            <p className="font-medium text-ink">You&apos;re all caught up.</p>
            <p className="mt-1 text-sm text-ink-soft">
              No requests are awaiting your review right now.
            </p>
          </div>
        )}

        {queue.length > 0 && (
          <div className="mt-6 space-y-3">
            {queue.map((item) => {
              const overCap = item.myClaimCount >= CLAIM_CAP;
              const claimedByOther =
                item.claimedBy != null && item.claimedBy !== myId;
              const claimedByMe = item.claimedBy != null && item.claimedBy === myId;

              return (
                <div
                  key={item.requestId}
                  className={`rounded-2xl border border-line border-l-4 bg-surface p-5 transition ${
                    item.priorityLevel
                      ? PRIORITY_BAR[item.priorityLevel] ?? "border-l-line"
                      : "border-l-line"
                  } ${overCap ? "opacity-60" : "hover:border-kq-red/40"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            item.priorityLevel
                              ? PRIORITY_STYLES[item.priorityLevel] ?? "bg-ink-soft text-white"
                              : "bg-line text-ink-soft"
                          }`}
                        >
                          {item.priorityLevel ?? "Unclassified"}
                        </span>
                        <span className="font-medium text-ink">#{item.requestId}</span>
                        <span className="text-ink">{item.category}</span>
                        {item.status === "Deferred" && (
                          <span className="rounded-full bg-ink-soft/15 px-2 py-0.5 text-xs font-semibold text-ink-soft">
                            Deferred
                          </span>
                        )}
                        {claimedByMe && (
                          <span className="rounded-full bg-low/15 px-2 py-0.5 text-xs font-semibold text-low">
                            Claimed by you
                          </span>
                        )}
                        {claimedByOther && (
                          <span className="rounded-full bg-ink-soft/15 px-2 py-0.5 text-xs font-semibold text-ink-soft">
                            Already claimed
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm text-ink-soft">
                        {item.requesterName} · KES {item.amount.toLocaleString()}
                      </p>
                      {item.validationNote && (
                        <p className="mt-2 inline-block rounded-md bg-medium/10 px-2 py-1 text-xs text-medium">
                          ⚑ {item.validationNote}
                        </p>
                      )}
                    </div>

                    {overCap ? (
                      <span className="shrink-0 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-soft">
                        Claim limit reached
                      </span>
                    ) : (
                      <button
                        onClick={() => router.push(`/requests/${item.requestId}`)}
                        className="shrink-0 rounded-lg border border-kq-red px-4 py-2 text-sm font-medium text-kq-red transition hover:bg-kq-red hover:text-white"
                      >
                        Review
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* D2: Finance only — the post-approval payout step, a separate panel from the
            tier-3 review queue above. */}
        {role === "Finance Officer" && (
          // id = the sidebar's "Awaiting disbursement" anchor (/dashboard/approver#disbursement).
          <div id="disbursement" className="scroll-mt-20">
            <AwaitingDisbursement myId={myId} />
          </div>
        )}

        {decided.length > 0 && (
          <>
            <h2 className="mt-10 font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
              Your past decisions
            </h2>
            <p className="text-sm text-ink-soft">
              Requests you have acted on, with their current status.
            </p>
            <div className="mt-4 space-y-3">
              {decided.map((item) => (
                <button
                  key={item.requestId}
                  onClick={() => router.push(`/requests/${item.requestId}`)}
                  className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-kq-red/40"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">#{item.requestId}</span>
                    <span className="text-ink">{item.category}</span>
                    {item.priorityLevel && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          PRIORITY_STYLES[item.priorityLevel] ?? "bg-ink-soft text-white"
                        }`}
                      >
                        {item.priorityLevel}
                      </span>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      statusStyle(item.status)
                    }`}
                  >
                    {statusLabel(item.status)}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
    </div>
  );
}