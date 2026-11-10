// Phase 3 — ONE definition of how a request's status / priority looks and which bucket it is in.
// Before this, every page carried its own STATUS_STYLES copy (and D2 had to add 'Disbursed' to
// each). Dashboard, My requests (C3), Track (C5) and the detail page now all read from here.

export type MyRequest = {
  requestId: number;
  category: string;
  amount: number;
  status: string;
  currentTier: number;
  priorityLevel: string | null;
  validationNote: string | null;
  createdAt: string;
};

export const PRIORITY_STYLES: Record<string, string> = {
  High: "bg-high text-white",
  Medium: "bg-medium text-white",
  Low: "bg-low text-white",
};

export const STATUS_STYLES: Record<string, string> = {
  "In Review": "bg-medium/15 text-medium",
  Approved: "bg-low/15 text-low",
  Disbursed: "bg-low text-white",          // D2: the final positive outcome
  Rejected: "bg-kq-red/15 text-kq-red",
  Returned: "bg-ink-soft/15 text-ink-soft",
  Deferred: "bg-ink-soft/15 text-ink-soft",
};
export const statusStyle = (s: string) => STATUS_STYLES[s] ?? "bg-ink-soft/15 text-ink-soft";

// D2: 'Approved' is no longer the end — say what happens next.
export const STATUS_LABELS: Record<string, string> = {
  Approved: "Approved — awaiting disbursement",
  Disbursed: "Disbursed (paid)",
};
export const statusLabel = (s: string) => STATUS_LABELS[s] ?? s;

// C3 buckets. "Accepted" includes Disbursed (approved AND paid) as well as Approved (awaiting pay).
export const isAccepted = (s: string) => s === "Approved" || s === "Disbursed";
export const isRejected = (s: string) => s === "Rejected";
// "Still moving" (for Track): everything that hasn't reached a final state. Approved counts as in
// progress because it still waits on Finance's payout; Disbursed and Rejected are final.
export const isInProgress = (s: string) => s !== "Rejected" && s !== "Disbursed";

// The tier each stage's officer works at (for the Track progress line).
export const TIER_ROLES = ["Department Supervisor", "Welfare Officer", "Finance Officer", "HR Manager"];
