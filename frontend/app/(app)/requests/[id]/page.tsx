"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import { statusLabel } from "@/app/lib/requestStatus";
import { LOGIN_PATH } from "@/app/lib/auth";

// The same categories the new-request form offers, so a resubmit can change category too.
const RESUBMIT_CATEGORIES = [
  "Medical Emergency",
  "Bereavement",
  "Hardship/Emergency Assistance",
  "Education Support",
];
// Description drafts per category — the same ones the new-request form offers. On resubmit,
// switching category offers the matching draft, but only while the box is empty or still
// holds an unedited draft; the employee's own text is never overwritten.
const RESUBMIT_DESCRIPTION_TEMPLATES: Record<string, string> = {
  "Medical Emergency": "Requesting assistance with medical expenses for ",
  Bereavement: "Requesting bereavement assistance following the passing of ",
  "Hardship/Emergency Assistance": "Requesting emergency assistance due to ",
  "Education Support": "Requesting education support for ",
};

type ShapFactor = { feature: string; impact: number };
type ApprovalItem = {
  tier: number;
  approverName: string;
  decision: string;
  reason: string | null;
  decidedAt: string;
};
type PredictionHistoryItem = {
  priorityLevel: string;
  predictedAt: string;
};
type RequestDetail = {
  requestId: number;
  requesterName: string;
  requesterId: number;   // Phase 3 (A7/C8): lets the page ask "is this MY request?"
  category: string;
  amount: number;
  description: string | null;
  status: string;
  currentTier: number;
  claimedBy: number | null;
  hasDocuments: number | null;
  validationNote: string | null;
  deferReason: string | null;
  createdAt: string;
  priorityLevel: string | null;
  explanation: string | null;   // JSON string of ShapFactor[]
  approvals: ApprovalItem[];
  predictionHistory: PredictionHistoryItem[];
  // D2: the Finance payout once Disbursed (note is only sent to approvers/admins).
  disbursement: {
    amount: number;
    reference: string | null;
    note: string | null;
    disbursedByName: string;
    disbursedAt: string;
  } | null;
};


const PRIORITY_STYLES: Record<string, string> = {
  High: "bg-high text-white",
  Medium: "bg-medium text-white",
  Low: "bg-low text-white",
};

// Read the current user's id from the JWT's "sub" claim (login stores the token
// but not the id). Returns null if it can't be read.
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

// Describe one SHAP factor in plain language, using this request's actual values,
// framed by its effect on priority. Returns null for factors that should be hidden
// (the category one-hots for categories this request ISN'T).
function describeFactor(
  factor: ShapFactor,
  detail: RequestDetail
): { text: string; raisesPriority: boolean } | null {
  const { feature, impact } = factor;

  // Convert the class-relative SHAP sign into an urgency direction, using the
  // predicted class. Positive impact pushes TOWARD the predicted class:
  //   predicted High  → toward High  = higher priority
  //   predicted Low   → toward Low   = lower priority (inverted)
  //   predicted Medium→ no clean higher/lower (sign used as-is)
  const priority = detail.priorityLevel;
  let raisesPriority: boolean;
  if (priority === "High") raisesPriority = impact >= 0;
  else if (priority === "Low") raisesPriority = impact < 0;
  else raisesPriority = impact >= 0;

  const dir = raisesPriority ? "pushed toward higher priority" : "pushed toward lower priority";

  // Category one-hot features: only describe the request's ACTUAL category; hide the rest.
  if (feature.startsWith("request_category_")) {
    const cat = feature.replace("request_category_", "");
    if (cat !== detail.category) return null; // hide "not this category" noise
    return { text: `This is a ${cat} request — ${dir}`, raisesPriority };
  }

  // Numeric / boolean features, phrased with the request's real value.
  switch (feature) {
    case "has_documents":
      return {
        text: detail.hasDocuments
          ? `Supporting documents were provided — ${dir}`
          : `No supporting documents were provided — ${dir}`,
        raisesPriority,
      };
    case "requested_amount":
      return { text: `Requested amount (KES ${detail.amount.toLocaleString()}) — ${dir}`, raisesPriority };
    case "salary":
      return { text: `Stated salary — ${dir}`, raisesPriority };
    case "employment_duration_months":
      return { text: `Length of employment — ${dir}`, raisesPriority };
    case "previous_requests":
      return { text: `Number of previous requests — ${dir}`, raisesPriority };
    case "request_frequency":
      return { text: `How often requests are made — ${dir}`, raisesPriority };
    default:
      return { text: `${feature} — ${dir}`, raisesPriority };
  }
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
  const [docError, setDocError] = useState("");

  // Edit & resubmit (owner, Returned request) state.
  const [editing, setEditing] = useState(false);
  const [editCategory, setEditCategory] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDescIsTemplate, setEditDescIsTemplate] = useState(false);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitMsg, setResubmitMsg] = useState("");

  // D2: Finance's Disburse action on this page (same endpoint + guards as the dashboard panel).
  const [disburseRef, setDisburseRef] = useState("");
  const [disburseNote, setDisburseNote] = useState("");
  const [disbursing, setDisbursing] = useState(false);
  const [disburseMsg, setDisburseMsg] = useState("");

  const myId = currentUserId();

  async function load() {
    const result = await apiFetch<RequestDetail>(`/requests/${id}`);
    setLoading(false);
    if (!result.ok) {
      if (result.status === 401) {
        router.replace(LOGIN_PATH);
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
      router.replace(LOGIN_PATH);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function claim() {
    setMessage("");
    setSubmitting(true);
    const result = await apiFetch<{ requestId: number }>(`/requests/${id}/claim`, {
      method: "POST",
    });
    setSubmitting(false);
    if (!result.ok) {
      setMessage(result.error);  // includes the over-cap message from the backend
      return;
    }
    load();
  }

  async function release() {
    setMessage("");
    setSubmitting(true);
    const result = await apiFetch<{ requestId: number }>(`/requests/${id}/release`, {
      method: "POST",
    });
    setSubmitting(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    load();
  }

  async function decide(decision: "Approve" | "Reject" | "Return" | "Defer") {
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
    load(); // refresh the detail (status/claim/history will have changed)
  }

  // D2: record the payout. The backend fixes the amount, refuses the officer's own request
  // (403) and a request someone else just paid (400/409) — those messages are shown as-is.
  async function disburse() {
    setDisburseMsg("");
    setDisbursing(true);
    const result = await apiFetch<{ amount: number }>(`/requests/${id}/disburse`, {
      method: "POST",
      body: { reference: disburseRef.trim() || null, note: disburseNote.trim() || null },
    });
    setDisbursing(false);
    if (!result.ok) {
      setDisburseMsg(result.error);
      load(); // the status may have changed under us (e.g. another officer paid it)
      return;
    }
    setDisburseRef("");
    setDisburseNote("");
    load(); // status → Disbursed; the "Paid out" box appears
  }

  // Open the edit form, prefilled with the request's current values.
  function openEditor() {
    if (!detail) return;
    setEditCategory(detail.category);
    setEditAmount(String(detail.amount));
    setEditDescription(detail.description ?? "");
    // The current description is the employee's own earlier text, not a draft — so it's
    // protected from being replaced when they change category. Only an empty box is free.
    setEditDescIsTemplate((detail.description ?? "").trim() === "");
    setEditFile(null);
    setResubmitMsg("");
    setEditing(true);
  }
  // Changing category on resubmit offers the matching description draft — but only while
  // the box is empty or still holds an unedited draft, so the employee's words are kept.
  function handleEditCategoryChange(next: string) {
    setEditCategory(next);
    if (
      (editDescription.trim() === "" || editDescIsTemplate) &&
      RESUBMIT_DESCRIPTION_TEMPLATES[next]
    ) {
      setEditDescription(RESUBMIT_DESCRIPTION_TEMPLATES[next]);
      setEditDescIsTemplate(true);
    }
  }

  // Submit the employee's clarifications. Sends multipart (so a new document can ride
  // along), hits the resubmit endpoint, which re-validates + re-classifies and puts the
  // request back In Review at the tier that returned it.
  async function resubmit() {
    setResubmitMsg("");
    const amt = Number(editAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setResubmitMsg("Enter a valid amount greater than zero.");
      return;
    }
    if (!editCategory) {
      setResubmitMsg("Please choose a category.");
      return;
    }
    const form = new FormData();
    form.append("category", editCategory);
    form.append("amount", String(amt));
    form.append("description", editDescription.trim());
    if (editFile) form.append("document", editFile);

    setResubmitting(true);
    const result = await apiFetch<{ status: string; currentTier: number }>(
      `/requests/${id}/resubmit`,
      { method: "POST", body: form }
    );
    setResubmitting(false);

    if (!result.ok) {
      setResubmitMsg(result.error);
      return;
    }
    setEditing(false);
    setResubmitMsg(
      result.data.status === "In Review"
        ? "Resubmitted — your request is back under review."
        : `Resubmitted, but it was ${result.data.status.toLowerCase()} again on the rules. See the note.`
    );
    load(); // status / prediction / history will have changed
  }

  // The document endpoint is JWT-protected, so we can't use a plain <a href> (a browser
  // navigation won't send the token). Fetch it with the auth header, turn the response
  // into a blob URL, and open that in a new tab.
  async function viewDocument() {
    setDocError("");
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/requests/${id}/document`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) {
        setDocError(
          res.status === 404
            ? "No document is attached to this request."
            : "Could not open the document."
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      setDocError("Could not reach the server to open the document.");
    }
  }

  const rawFactors: ShapFactor[] = detail?.explanation
    ? (() => {
        try {
          return JSON.parse(detail.explanation) as ShapFactor[];
        } catch {
          return [];
        }
      })()
    : [];

  // Describe each factor in plain language and drop the hidden (non-matching category) ones.
  const described = detail
    ? rawFactors
        .map((f) => ({ factor: f, d: describeFactor(f, detail) }))
        .filter(
          (x): x is { factor: ShapFactor; d: { text: string; raisesPriority: boolean } } =>
            x.d !== null
        )
    : [];
  const maxImpact = described.reduce((m, x) => Math.max(m, Math.abs(x.factor.impact)), 0) || 1;

  // Plain-language summary from the top factors that drove the rating.
  const summary = (() => {
    if (!detail?.priorityLevel || described.length === 0) return null;
    const drivers = described
      .filter((x) => x.d.raisesPriority === (detail.priorityLevel !== "Low"))
      .slice(0, 2)
      .map((x) => x.d.text.split(" — ")[0].replace(/^This is a /, "").toLowerCase());
    if (drivers.length === 0) {
      return `This request was rated ${detail.priorityLevel} priority based on its overall profile.`;
    }
    return `This request was rated ${detail.priorityLevel} priority mainly due to ${drivers.join(" and ")}.`;
  })();

  const role = typeof window !== "undefined" ? localStorage.getItem("role") : null;
  const roleTier: Record<string, number> = {
    "Department Supervisor": 1,
    "Welfare Officer": 2,
    "Finance Officer": 3,
    "HR Manager": 4,
  };
    const isApprover = role != null && roleTier[role] !== undefined;
  const isAdmin = role === "System Administrator";

  // Actionable at my tier when In Review at my tier, or (Finance only) Deferred at tier 3.
  // Phase 3 (A7/C8): approvers can now submit their own requests, so "owner" and "approver" are
  // no longer opposites. Ownership is checked directly against the request's owner id.
  const isOwner = detail != null && myId != null && detail.requesterId === myId;

  const atMyTier =
    detail != null &&
    isApprover &&
    !isOwner &&   // never offer claim/decide on your own request (the backend refuses it too — A24 #2)
    roleTier[role!] === detail.currentTier &&
    (detail.status === "In Review" ||
      (detail.status === "Deferred" && roleTier[role!] === 3));

  const iHoldIt = detail != null && myId != null && detail.claimedBy === myId;
  const heldByOther =
    detail != null && detail.claimedBy != null && detail.claimedBy !== myId;

  const canDecide = atMyTier && iHoldIt;
  const canClaim = atMyTier && detail?.claimedBy == null;
  const isFinance = role === "Finance Officer";
  // D2: a Finance Officer can pay out a fully approved request from here too.
  const canDisburse = isFinance && detail?.status === "Approved" && !isOwner;   // D2 gap closed: not on your own

  // The owner may edit & resubmit their OWN request only while it is Returned. Phase 3 (A7/C8):
  // was `!isApprover && !isAdmin` ("a non-approver who can see it must be the owner") — no longer
  // true now approvers submit too, so it's now simply "is the owner".
  const canResubmit = isOwner && detail?.status === "Returned";

  return (
    // Phase 3: content inside the AppShell (which provides <main>).
    <div>
      <div className="mx-auto w-full max-w-2xl">
        <button
          onClick={() =>
            router.push(
              isOwner
                ? "/my-requests"
                : isAdmin
                ? "/dashboard/admin"
                : isApprover
                ? "/dashboard/approver"
                : "/dashboard/employee"
            )
          }
          className="text-sm text-ink-soft hover:text-ink transition"
        >
          {isOwner ? "← Back to my requests" : "← Back to dashboard"}
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
              <Fact label="Status" value={statusLabel(detail.status)} />
              <Fact label="Current tier" value={String(detail.currentTier)} />
              <div>
                <p className="text-ink-soft">Documents</p>
                {detail.hasDocuments ? (
                  <button
                    onClick={viewDocument}
                    className="mt-0.5 text-kq-red hover:underline"
                  >
                    View document
                  </button>
                ) : (
                  <p className="mt-0.5 text-ink">None</p>
                )}
                {docError && <p className="mt-1 text-xs text-kq-red">{docError}</p>}
              </div>
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
              {detail.status === "Deferred" && detail.deferReason && (
                <div className="col-span-2">
                  <p className="text-ink-soft">Reason for deferral</p>
                  <p className="mt-0.5 text-ink">{detail.deferReason}</p>
                </div>
              )}
              {/* D2: the payout record — the request's final, positive outcome. */}
              {detail.disbursement && (
                <div className="col-span-2 rounded-xl border border-low/30 bg-low/10 p-4">
                  <p className="font-medium text-low">
                    Paid out: KES {detail.disbursement.amount.toLocaleString()}
                  </p>
                  <p className="mt-1 text-ink-soft">
                    By {detail.disbursement.disbursedByName} (Finance) on{" "}
                    {new Date(detail.disbursement.disbursedAt).toLocaleString()}
                    {detail.disbursement.reference && <> · Reference: {detail.disbursement.reference}</>}
                  </p>
                  {detail.disbursement.note && (
                    <p className="mt-1 text-ink-soft">Internal note: {detail.disbursement.note}</p>
                  )}
                </div>
              )}
            </div>

            {/* SHAP explanation — plain-language summary first, then the detail bars. */}
            <h2 className="mt-8 font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
              Why this priority?
            </h2>

            {summary && (
              <p className="mt-2 rounded-xl border border-line bg-canvas p-4 text-ink">
                {summary}
              </p>
            )}

            {/* Priority history — shown once the request has been resubmitted and
                re-classified (more than one prediction). Newest first from the backend. */}
            {detail.predictionHistory && detail.predictionHistory.length > 1 && (
              <p className="mt-2 text-xs text-ink-soft">
                Priority history:{" "}
                {detail.predictionHistory
                  .map((p) => p.priorityLevel)
                  .reverse()
                  .join(" → ")}{" "}
                (updated after resubmission)
              </p>
            )}

            {described.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-line bg-surface p-6">
                <div className="flex items-center justify-between text-xs text-ink-soft">
                  <span>Contributing factors (for this request)</span>
                  <span>
                    <span className="text-high">↑ higher</span> ·{" "}
                    <span className="text-low">↓ lower</span> priority
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {described.map((x) => {
                    const width = `${(Math.abs(x.factor.impact) / maxImpact) * 100}%`;
                    const up = x.d.raisesPriority;
                    return (
                      <div key={x.factor.feature}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-ink">{x.d.text}</span>
                          <span className={`shrink-0 ${up ? "text-high" : "text-low"}`}>
                            {up ? "↑ higher" : "↓ lower"}
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full rounded-full bg-canvas">
                          <div
                            className={`h-2 rounded-full ${up ? "bg-high" : "bg-low"}`}
                            style={{ width }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
                  These are the factors that most influenced the model&apos;s ranking of this
                  request — a transparency aid, not a confidence score. The final decision is the approver&apos;s.
                </p>
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

            {/* Edit & resubmit — owner only, while the request is Returned. */}
            {canResubmit && (
              <div className="mt-8 rounded-2xl border border-medium/40 bg-surface p-6">
                <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
                  This request was returned for clarification
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                  {detail.validationNote ??
                    detail.approvals.find((a) => a.decision === "Returned")?.reason ??
                    "Please review the comments above, make your changes, and resubmit."}
                </p>

                {!editing ? (
                  <button
                    onClick={openEditor}
                    className="mt-4 rounded-lg bg-kq-red px-4 py-2 text-sm font-medium text-white transition hover:bg-kq-red-deep"
                  >
                    Edit &amp; resubmit
                  </button>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="block text-sm text-ink-soft">Category</label>
                      <select
                        value={editCategory}
                        onChange={(e) => handleEditCategoryChange(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                      >
                        <option value="">Select a category…</option>
                        {RESUBMIT_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-ink-soft">Amount (KES)</label>
                      <input
                        type="number"
                        min={1}
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-ink-soft">Description</label>
                      <textarea
                        rows={3}
                        value={editDescription}
                        onChange={(e) => {
                          setEditDescription(e.target.value);
                          setEditDescIsTemplate(false);
                        }}
                        className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                        placeholder="Explain or clarify your request…"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-ink-soft">
                        Supporting document (optional — replaces any existing one)
                      </label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => setEditFile(e.target.files?.[0] ?? null)}
                        className="mt-1 block w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-canvas file:px-3 file:py-2 file:text-sm file:text-ink"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={resubmit}
                        disabled={resubmitting}
                        className="rounded-lg bg-kq-red px-4 py-2 text-sm font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60"
                      >
                        {resubmitting ? "Resubmitting…" : "Resubmit"}
                      </button>
                      <button
                        onClick={() => setEditing(false)}
                        disabled={resubmitting}
                        className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {resubmitMsg && <p className="mt-3 text-sm text-ink">{resubmitMsg}</p>}
              </div>
            )}

            {/* D2: Finance payout — post-approval, keyed on status (not tier/claim). */}
            {canDisburse && (
              <div className="mt-8 rounded-2xl border border-low/30 border-l-4 border-l-low bg-surface p-6">
                <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
                  Disburse this request
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                  Fully approved by HR. Pay out{" "}
                  <span className="font-semibold text-ink">KES {detail.amount.toLocaleString()}</span> — the
                  approved amount (fixed; no partial payments).
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    value={disburseRef}
                    onChange={(e) => setDisburseRef(e.target.value)}
                    maxLength={100}
                    placeholder="Payment reference (optional)"
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                  />
                  <input
                    value={disburseNote}
                    onChange={(e) => setDisburseNote(e.target.value)}
                    placeholder="Internal note (optional)"
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                  />
                </div>
                <button
                  onClick={disburse}
                  disabled={disbursing}
                  className="mt-4 rounded-lg bg-low px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {disbursing ? "Recording…" : "Disburse"}
                </button>
                {disburseMsg && (
                  <p className="mt-3 text-sm text-kq-red" role="alert">
                    {disburseMsg}
                  </p>
                )}
              </div>
            )}

            {/* Claim / decision area — only for an approver whose tier this request is at. */}
            {atMyTier && (
              <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
                {/* Claim state + claim/release controls */}
                {heldByOther ? (
                  <p className="text-sm text-ink-soft">
                    This request is currently claimed by another officer. You can act on
                    it only if they release it.
                  </p>
                ) : iHoldIt ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-low">You have claimed this request.</p>
                    <button
                      onClick={release}
                      disabled={submitting}
                      className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-canvas disabled:opacity-60"
                    >
                      Release
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-ink-soft">
                      Claim this request to review and act on it.
                    </p>
                    <button
                      onClick={claim}
                      disabled={submitting || !canClaim}
                      className="rounded-lg bg-kq-red px-4 py-2 text-sm font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60"
                    >
                      Claim
                    </button>
                  </div>
                )}

                {/* Decision controls — only when I hold the claim. */}
                {canDecide && (
                  <div className="mt-5 border-t border-line pt-5">
                    <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
                      Your decision
                    </h2>
                    <label className="mt-3 block text-sm text-ink-soft">
                      Comment / reason (required to reject, return, or defer)
                    </label>
                    <textarea
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                      placeholder="Add a comment…"
                    />
                    <div className="mt-4 flex flex-wrap gap-3">
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
                      {isFinance && (
                        <button
                          onClick={() => decide("Defer")}
                          disabled={submitting}
                          className="rounded-lg border border-ink-soft px-4 py-2 font-medium text-ink transition hover:bg-canvas disabled:opacity-60"
                        >
                          Defer
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {message && <p className="mt-4 text-sm text-ink">{message}</p>}
              </div>
            )}

            {/* Messages for non-actionable states (e.g. an employee viewing, or over-cap). */}
            {!atMyTier && message && (
              <p className="mt-6 text-sm text-ink">{message}</p>
            )}
          </>
        )}
      </div>
    </div>
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