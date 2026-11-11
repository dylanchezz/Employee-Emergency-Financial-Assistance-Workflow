// Phase 5 (E2) — the full, dated trail of one request: submission → every tier decision
// (approvals.decided_at) → the payout (disbursements.disbursed_at) → where it is now.
// Build decision 3: built from the EXISTING request-detail response (it already carried the
// submission time, the approval history with timestamps and, since D2, the disbursement) — no new
// endpoint. Pure presentation, no data fetching.
//
// approvals.reason means different things by decision (Phase 5, E3): on Rejected/Returned it's the
// REASON (for the employee); on Approved it's an optional NOTE for the next approver — the backend
// strips those for the request's owner, so if one is present here the viewer is staff.

import { TIER_ROLES } from "../lib/requestStatus";

type Approval = { tier: number; approverName: string; decision: string; reason: string | null; decidedAt: string };
type Payout = { amount: number; reference: string | null; disbursedByName: string; disbursedAt: string } | null;

export type TimelineInput = {
  createdAt: string;
  status: string;
  currentTier: number;
  validationNote: string | null;
  deferReason: string | null;
  approvals: Approval[];
  disbursement: Payout;
};

type Event = { key: string; when: string | null; title: string; detail?: string; tone: "done" | "stop" | "now" | "paid" };

const roleFor = (tier: number) => TIER_ROLES[tier - 1] ?? `Tier ${tier}`;
const fmt = (iso: string) => new Date(iso).toLocaleString();

function buildEvents(r: TimelineInput, viewerIsOwner: boolean): Event[] {
  const events: Event[] = [];
  const stoppedAtChecks = r.currentTier === 0 && (r.status === "Rejected" || r.status === "Returned") && r.approvals.length === 0;

  events.push({
    key: "submitted",
    when: r.createdAt,
    title: "Submitted",
    detail: stoppedAtChecks
      ? `Stopped at the automatic checks: ${r.validationNote ?? r.status}`
      : r.validationNote
        ? `Passed the automatic checks, flagged for review: ${r.validationNote}`
        : "Passed the automatic checks.",
    tone: stoppedAtChecks ? "stop" : "done",
  });

  r.approvals.forEach((a, i) => {
    const approved = a.decision === "Approved";
    events.push({
      key: `a${i}`,
      when: a.decidedAt,
      title: `${roleFor(a.tier)} — ${a.decision.toLowerCase()}`,
      detail: [
        `by ${a.approverName}`,
        a.reason ? (approved ? `Note for the next approver: ${a.reason}` : `Reason: ${a.reason}`) : null,
      ].filter(Boolean).join(" · "),
      tone: approved ? "done" : "stop",
    });
  });

  if (r.disbursement) {
    events.push({
      key: "paid",
      when: r.disbursement.disbursedAt,
      title: `Disbursed — KES ${r.disbursement.amount.toLocaleString()}`,
      detail: `by ${r.disbursement.disbursedByName} (Finance)${r.disbursement.reference ? ` · reference ${r.disbursement.reference}` : ""}`,
      tone: "paid",
    });
  }

  // Where it is now (no timestamp — it's the present).
  const now: Record<string, string | undefined> = {
    "In Review": `With the ${roleFor(r.currentTier)} for review`,
    Approved: "Fully approved — awaiting disbursement by Finance",
    Deferred: `Deferred at Finance${r.deferReason ? `: ${r.deferReason}` : ""}`,
    Returned: viewerIsOwner ? "Waiting for your clarification" : "Returned to the employee for clarification",
  };
  if (now[r.status]) events.push({ key: "now", when: null, title: now[r.status]!, tone: "now" });

  return events;
}

const DOT: Record<Event["tone"], string> = {
  done: "bg-low",
  stop: "bg-kq-red",
  now: "bg-medium ring-4 ring-medium/20",
  paid: "bg-low ring-4 ring-low/20",
};

export default function RequestTimeline({ request, viewerIsOwner }: { request: TimelineInput; viewerIsOwner: boolean }) {
  const events = buildEvents(request, viewerIsOwner);
  return (
    <ol className="mt-4 rounded-2xl border border-line bg-surface p-6">
      {events.map((e, i) => (
        <li key={e.key} className="relative flex gap-4 pb-6 last:pb-0">
          {/* the connecting line */}
          {i < events.length - 1 && <span aria-hidden className="absolute left-[5px] top-4 h-full w-px bg-line" />}
          <span aria-hidden className={`relative mt-1.5 h-3 w-3 shrink-0 rounded-full ${DOT[e.tone]}`} />
          <div className="min-w-0">
            <p className={`font-medium ${e.tone === "now" ? "text-medium" : "text-ink"}`}>{e.title}</p>
            {e.detail && <p className="mt-0.5 break-words text-sm text-ink-soft">{e.detail}</p>}
            <p className="mt-0.5 text-xs text-ink-soft">{e.when ? fmt(e.when) : "Now"}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
