"use client";

// Phase 3 — C5 "Track request": the requests still moving through the workflow, each with a
// progress line (Submitted → the four tiers → Approved → Disbursed), plus a "go to #N" box.
// Same data as before (/requests/mine + the detail page) — relocated into its own sidebar route,
// and available to approvers for their OWN requests (A7/C8).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import { isInProgress, statusLabel, statusStyle, TIER_ROLES, type MyRequest } from "@/app/lib/requestStatus";

const STEPS = ["Submitted", ...TIER_ROLES.map((r) => r.replace("Department ", "")), "Paid"];

// Where on the line a request is. Tiers 1–4 map to steps 1–4; Approved = HR done (waiting on
// payment, step 5 next); a request stopped at the automatic checks (tier 0) sits at step 0.
function stepOf(r: MyRequest): number {
  if (r.status === "Approved") return 5;
  if (r.status === "Disbursed") return 6;
  return Math.max(0, Math.min(4, r.currentTier));
}

export default function TrackPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [lookup, setLookup] = useState("");

  useEffect(() => {
    apiFetch<MyRequest[]>("/requests/mine").then((res) => {
      setLoaded(true);
      if (res.ok) setRequests(res.data);
      else setError(res.error);
    });
  }, []);

  const active = requests.filter((r) => isInProgress(r.status));

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">Track request</h1>
      <p className="mt-1 text-sm text-ink-soft">Your requests that are still moving through review.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(lookup.replace(/\D/g, ""));
          if (n > 0) router.push(`/requests/${n}`);
        }}
        className="mt-5 flex gap-2"
      >
        <input value={lookup} onChange={(e) => setLookup(e.target.value)} inputMode="numeric"
          placeholder="Request number, e.g. 42"
          className="w-56 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20" />
        <button type="submit" className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas">
          Open
        </button>
      </form>

      {!loaded && <p className="mt-6 text-ink-soft">Loading…</p>}
      {error && <p className="mt-6 text-sm text-kq-red">{error}</p>}
      {loaded && !error && active.length === 0 && (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-10 text-center text-sm text-ink-soft">
          Nothing in progress. Finished requests are under <Link href="/my-requests" className="text-kq-red hover:underline">My requests</Link>.
        </div>
      )}

      <div className="mt-6 space-y-3">
        {active.map((r) => {
          const step = stepOf(r);
          return (
            <Link key={r.requestId} href={`/requests/${r.requestId}`}
              className="block rounded-2xl border border-line bg-surface p-5 transition hover:border-kq-red/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink">#{r.requestId} · {r.category}</span>
                <span className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(r.status)}`}>{statusLabel(r.status)}</span>
              </div>
              {/* Progress line */}
              <ol className="mt-4 grid grid-cols-6 gap-1" aria-label="Progress">
                {STEPS.map((label, i) => (
                  <li key={label} className="min-w-0">
                    <div className={`h-1.5 rounded-full ${i < step ? "bg-low" : i === step ? "bg-medium" : "bg-line"}`} />
                    <p className={`mt-1.5 truncate text-[11px] ${i === step ? "font-semibold text-ink" : "text-ink-soft"}`}>{label}</p>
                  </li>
                ))}
              </ol>
              {(r.status === "Returned" || r.status === "Deferred") && (
                <p className="mt-3 text-xs text-ink-soft">
                  {r.status === "Returned" ? "Waiting on your clarification — open it to edit and resubmit." : "Deferred by Finance (funds temporarily unavailable)."}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
