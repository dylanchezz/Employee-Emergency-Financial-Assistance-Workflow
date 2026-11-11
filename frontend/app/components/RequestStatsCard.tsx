"use client";

// Phase 5 (E1) — request frequency + remaining annual allowance. The numbers come from
// GET /api/me/request-stats, which is computed by the SAME ValidationService code that enforces the
// annual limit (rule 3) — so "you can make 1 more" is exactly what the rule will allow.

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type Stats = {
  allTime: number;
  last12Months: number;
  countedTowardLimit: number;
  annualLimit: number;
  remainingAllowance: number;
  nextSlotOpensAt: string | null;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function RequestStatsCard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    apiFetch<Stats>("/me/request-stats").then((res) => {
      if (res.ok) setStats(res.data);
    });
  }, []);

  if (!stats) return null;
  const used = stats.countedTowardLimit;
  const full = stats.remainingAllowance === 0;

  return (
    <div className={`rounded-2xl border p-5 ${full ? "border-kq-red/30 bg-kq-red/5" : "border-line bg-surface"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-ink">Your request allowance</p>
        <p className="text-sm text-ink-soft">
          {used} of {stats.annualLimit} used in the last 12 months
        </p>
      </div>
      {/* The allowance bar: one segment per allowed request. */}
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {Array.from({ length: stats.annualLimit }, (_, i) => (
          <span key={i} className={`h-2 flex-1 rounded-full ${i < used ? (full ? "bg-kq-red" : "bg-medium") : "bg-line"}`} />
        ))}
      </div>
      <p className="mt-3 text-sm text-ink">
        You&apos;ve made {plural(stats.allTime, "request")} ({stats.last12Months} in the last 12 months).{" "}
        {full ? (
          <>
            <span className="font-medium text-kq-red">You&apos;ve reached the limit of {stats.annualLimit} per 12 months</span>
            {" "}— a new request now would be rejected automatically
            {stats.nextSlotOpensAt && <>; you can submit again from {new Date(stats.nextSlotOpensAt).toLocaleDateString()}</>}.
          </>
        ) : (
          <>
            You can make <span className="font-semibold">{plural(stats.remainingAllowance, "more request")}</span> in the current 12-month window.
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-ink-soft">Rejected requests don&apos;t count toward the limit.</p>
    </div>
  );
}
