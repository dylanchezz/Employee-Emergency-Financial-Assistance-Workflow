"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiFetch } from "../../lib/api";

type ShapFactor = { feature: string; impact: number };
type ApprovalItem = {
  tier: number;
  approverName: string;
  decision: string;
  reason: string | null;
  decidedAt: string;
};
type RequestDetail = {
  requestId: number;
  requesterName: string;
  category: string;
  amount: number;
  description: string | null;
  status: string;
  currentTier: number;
  hasDocuments: number | null;
  validationNote: string | null;
  createdAt: string;
  priorityLevel: string | null;
  explanation: string | null;   // JSON string of ShapFactor[]
  approvals: ApprovalItem[];
};

const PRIORITY_STYLES: Record<string, string> = {
  High: "bg-high text-white",
  Medium: "bg-medium text-white",
  Low: "bg-low text-white",
};

// Turn a raw model feature name into a plain-language label.
function readableFeature(feature: string): string {
  if (feature.startsWith("request_category_")) {
    return `Category: ${feature.replace("request_category_", "")}`;
  }
  const map: Record<string, string> = {
    requested_amount: "Requested amount",
    salary: "Salary",
    employment_duration_months: "Length of employment",
    previous_requests: "Previous requests",
    request_frequency: "Request frequency",
    has_documents: "Supporting documents",
  };
  return map[feature] ?? feature;
}

export default function RequestDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const result = await apiFetch<RequestDetail>(`/requests/${id}`);
    setLoading(false);
    if (!result.ok) {
      if (result.status === 401) {
        router.replace("/");
        return;
      }
      setError(result.error);
      return;
    }
    setDetail(result.data);
  }

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function decide(decision: "Approve" | "Reject" | "Return") {
    setMessage("");
    if ((decision === "Reject" || decision === "Return") && !reason.trim()) {
      setMessage("A reason is required to reject or return.");
      return;
    }
    setSubmitting(true);
    const result = await apiFetch<{ status: string }>(`/requests/${id}/decision`, {
      method: "POST",
      body: { decision, reason: reason.trim() || null },
    });
    setSubmitting(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMessage(`Decision recorded: ${result.data.status}.`);
    setReason("");
    load(); // refresh the detail (status/history will have changed)
  }

  const factors: ShapFactor[] = detail?.explanation
    ? (() => {
        try {
          return JSON.parse(detail.explanation) as ShapFactor[];
        } catch {
          return [];
        }
      })()
    : [];
  const maxImpact = factors.reduce((m, f) => Math.max(m, Math.abs(f.impact)), 0) || 1;

  // Only an approver at this request's tier, on an In-Review request, can decide.
  const role = typeof window !== "undefined" ? localStorage.getItem("role") : null;
  const roleTier: Record<string, number> = {
    "Department Supervisor": 1,
    "Welfare Officer": 2,
    "Finance Officer": 3,
    "HR Manager": 4,
  };
  const canDecide =
    detail?.status === "In Review" &&
    role != null &&
    roleTier[role] === detail?.currentTier;

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <button
          onClick={() =>
            router.push(
              role && roleTier[role] ? "/dashboard/approver" : "/dashboard/employee"
            )
          }
          className = "text-sm text-ink-soft hover:text-ink transition"
          >
            ← Back to dashboard
        </button>

        {loading && <p className="mt-6 text-ink-soft">Loading…</p>}
        {error && <p className="mt-6 text-sm text-kq-red">{error}</p>}

        {detail && (
          <>
            <div className="mt-4 flex items-start justify-between">
              <div>
                <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">
                  Request #{detail.requestId}
                </h1>
                <p className="mt-1 text-ink-soft">
                  {detail.requesterName} · {detail.category}
                </p>
              </div>
              {detail.priorityLevel && (
                <span
                  className={`rounded-full px-3 py-1 text-sm font-semibold ${
                    PRIORITY_STYLES[detail.priorityLevel] ?? "bg-ink-soft text-white"
                  }`}
                >
                  {detail.priorityLevel} priority
                </span>
              )}
            </div>

            {/* Request facts */}
            <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl border border-line bg-surface p-6 text-sm">
              <Fact label="Amount (KES)" value={detail.amount.toLocaleString()} />
              <Fact label="Status" value={detail.status} />
              <Fact label="Current tier" value={String(detail.currentTier)} />
              <Fact label="Documents" value={detail.hasDocuments ? "Provided" : "None"} />
              {detail.description && (
                <div className="col-span-2">
                  <p className="text-ink-soft">Description</p>
                  <p className="mt-0.5 text-ink">{detail.description}</p>
                </div>
              )}
              {detail.validationNote && (
                <div className="col-span-2">
                  <p className="text-ink-soft">Validation note</p>
                  <p className="mt-0.5 text-medium">{detail.validationNote}</p>
                </div>
              )}
            </div>

            {/* SHAP explanation */}
            <h2 className="mt-8 font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
              Why this priority?
            </h2>
            <p className="text-sm text-ink-soft">
              The main factors behind the model&apos;s prediction.
            </p>
            {factors.length > 0 ? (
              <div className="mt-4 space-y-3 rounded-2xl border border-line bg-surface p-6">
                {factors.map((f) => {
                  const raises = f.impact >= 0;
                  const width = `${(Math.abs(f.impact) / maxImpact) * 100}%`;
                  return (
                    <div key={f.feature}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink">
                          {readableFeature(f.feature)}
                        </span>
                        <span className={raises ? "text-high" : "text-low"}>
                          {raises ? "↑ raises" : "↓ lowers"}
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-canvas">
                        <div
                          className={`h-2 rounded-full ${raises ? "bg-high" : "bg-low"}`}
                          style={{ width }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-sm text-ink-soft">
                No explanation available (this request was not classified).
              </p>
            )}

            {/* Approval history */}
            {detail.approvals.length > 0 && (
              <>
                <h2 className="mt-8 font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
                  Approval history
                </h2>
                <div className="mt-4 space-y-2">
                  {detail.approvals.map((a, i) => (
                    <div key={i} className="rounded-lg border border-line bg-surface p-3 text-sm">
                      <span className="font-medium text-ink">Tier {a.tier}</span> ·{" "}
                      {a.approverName} — {a.decision}
                      {a.reason && <span className="text-ink-soft"> ({a.reason})</span>}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Decision controls */}
            {canDecide ? (
              <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
                <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
                  Your decision
                </h2>
                <label className="mt-3 block text-sm text-ink-soft">
                  Comment / reason (required to reject or return)
                </label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                  placeholder="Add a comment…"
                />
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => decide("Approve")}
                    disabled={submitting}
                    className="rounded-lg bg-low px-4 py-2 font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => decide("Return")}
                    disabled={submitting}
                    className="rounded-lg bg-medium px-4 py-2 font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    Return
                  </button>
                  <button
                    onClick={() => decide("Reject")}
                    disabled={submitting}
                    className="rounded-lg bg-kq-red px-4 py-2 font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
                {message && <p className="mt-4 text-sm text-ink">{message}</p>}
              </div>
            ) : (
              message && <p className="mt-6 text-sm text-ink">{message}</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-ink-soft">{label}</p>
      <p className="mt-0.5 text-ink">{value}</p>
    </div>
  );
}