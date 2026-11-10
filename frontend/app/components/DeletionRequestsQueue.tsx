"use client";

// C2 — the admin's "Deletion requests" queue. Approve = SOFT-delete (deactivate the account;
// history kept). Reject = the account stays active. Guards live in the backend: an admin can't
// approve their own deactivation, and the last active administrator can't be deactivated.

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type PendingDeletion = {
  deletionId: number;
  userId: number;
  name: string;
  email: string;
  role: string;
  department: string;
  reason: string | null;
  requestedAt: string;
};

export default function DeletionRequestsQueue({ onChanged }: { onChanged?: () => void }) {
  const [items, setItems] = useState<PendingDeletion[]>([]);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const res = await apiFetch<PendingDeletion[]>("/admin/deletion-requests");
    if (res.ok) {
      setItems(res.data);
      setLoadError("");
    } else {
      setLoadError(res.error);
    }
  }

  useEffect(() => {
    (async () => {
      const res = await apiFetch<PendingDeletion[]>("/admin/deletion-requests");
      if (res.ok) setItems(res.data);
      else setLoadError(res.error);
    })();
  }, []);

  async function approve(d: PendingDeletion) {
    const ok = window.confirm(
      `Deactivate ${d.name} (${d.email})?\n\nThey will no longer be able to sign in. Their history is kept. ` +
        "There is no reactivation screen yet."
    );
    if (!ok) return;
    setBusyId(d.deletionId);
    setMessage("");
    const res = await apiFetch<{ confirmationEmailSent: boolean }>(
      `/admin/deletion-requests/${d.deletionId}/approve`,
      { method: "POST" }
    );
    setBusyId(null);
    setMessage(
      res.ok
        ? `${d.name}'s account has been deactivated.${res.data.confirmationEmailSent ? " Confirmation email sent." : ""}`
        : res.error
    );
    load();
    onChanged?.();
  }

  async function reject(d: PendingDeletion) {
    const reason = window.prompt(`Decline ${d.name}'s deletion request? Optional reason shown to them:`, "");
    if (reason === null) return; // cancelled the prompt
    setBusyId(d.deletionId);
    setMessage("");
    const res = await apiFetch(`/admin/deletion-requests/${d.deletionId}/reject`, {
      method: "POST",
      body: { reason: reason.trim() || null },
    });
    setBusyId(null);
    setMessage(res.ok ? `${d.name}'s deletion request was declined; the account stays active.` : res.error);
    load();
  }

  return (
    <section>
      <h2 className="mt-10 font-[family-name:var(--font-heading)] text-xl font-semibold text-ink">
        Deletion requests
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Approving deactivates the account (soft-delete): no more sign-in, but its history is kept for the audit trail.
      </p>

      {message && <p className="mt-3 text-sm text-ink">{message}</p>}
      {loadError && (
        <p className="mt-3 text-sm text-kq-red" role="alert">
          Couldn&apos;t load deletion requests: {loadError}
        </p>
      )}

      {!loadError && items.length === 0 && (
        <p className="mt-4 rounded-2xl border border-line bg-surface p-5 text-sm text-ink-soft">
          No pending deletion requests.
        </p>
      )}

      {items.length > 0 && (
        <div className="mt-4 space-y-3">
          {items.map((d) => (
            <div key={d.deletionId} className="rounded-2xl border border-line border-l-4 border-l-kq-red bg-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-ink">
                    {d.name} <span className="text-ink-soft">· {d.email}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {d.role} · {d.department} · requested {new Date(d.requestedAt).toLocaleString()}
                  </p>
                  {d.reason && <p className="mt-2 text-sm text-ink">&ldquo;{d.reason}&rdquo;</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => reject(d)}
                    disabled={busyId === d.deletionId}
                    className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-canvas disabled:opacity-60"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => approve(d)}
                    disabled={busyId === d.deletionId}
                    className="rounded-lg bg-kq-red px-3 py-2 text-sm font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60"
                  >
                    Approve &amp; deactivate
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
