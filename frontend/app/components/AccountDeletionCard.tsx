"use client";

// C2 — "Request account deletion" (minimal: folds into the Profile screen, backlog C1, later).
// Deletion is a SOFT-delete that an administrator must approve: the account is deactivated and
// can no longer sign in, but the history of requests and decisions is kept (audit retention).

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type MyDeletion = {
  deletionId: number;
  status: "Pending" | "Approved" | "Rejected" | "Cancelled";
  reason: string | null;
  requestedAt: string;
  decidedAt: string | null;
} | null;

export default function AccountDeletionCard() {
  const [current, setCurrent] = useState<MyDeletion>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const res = await apiFetch<MyDeletion>("/me/deletion-request");
    if (res.ok) setCurrent(res.data ?? null);
    setLoaded(true);
  }

  useEffect(() => {
    (async () => {
      const res = await apiFetch<MyDeletion>("/me/deletion-request");
      if (res.ok) setCurrent(res.data ?? null);
      setLoaded(true);
    })();
  }, []);

  async function submit() {
    const ok = window.confirm(
      "Request deletion of your account?\n\n" +
        "An administrator must approve it. Once approved, your account is deactivated and you can no longer sign in. " +
        "The history of your requests and decisions is kept for audit purposes.\n\n" +
        "You can cancel while the request is pending."
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    const res = await apiFetch("/me/deletion-request", {
      method: "POST",
      body: { reason: reason.trim() || null },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);   // e.g. last active admin, or already pending (409)
      return;
    }
    setOpen(false);
    setReason("");
    refresh();
  }

  async function cancel() {
    setBusy(true);
    setError("");
    const res = await apiFetch("/me/deletion-request/cancel", { method: "POST" });
    setBusy(false);
    if (!res.ok) setError(res.error);
    refresh();
  }

  if (!loaded) return null;
  const pending = current?.status === "Pending";

  return (
    <section className="mt-12 rounded-2xl border border-line bg-surface p-6">
      <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">Account</h2>

      {pending ? (
        <div className="mt-2">
          <p className="text-sm text-ink">
            Your account deletion request is <span className="font-semibold">pending administrator approval</span>{" "}
            (requested {new Date(current!.requestedAt).toLocaleString()}).
          </p>
          <button
            onClick={cancel}
            disabled={busy}
            className="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas disabled:opacity-60"
          >
            {busy ? "Cancelling…" : "Cancel deletion request"}
          </button>
        </div>
      ) : (
        <div className="mt-2">
          {current?.status === "Rejected" && (
            <p className="mb-3 text-sm text-ink-soft">
              Your previous deletion request was declined by an administrator
              {current.reason ? `: ${current.reason}` : "."}
            </p>
          )}
          <p className="text-sm text-ink-soft">
            Deleting your account needs administrator approval. Your account will be deactivated (you won&apos;t be
            able to sign in); the history of your requests is kept for audit purposes.
          </p>
          {!open ? (
            <button
              onClick={() => setOpen(true)}
              className="mt-3 rounded-lg border border-kq-red px-4 py-2 text-sm font-medium text-kq-red transition hover:bg-kq-red hover:text-white"
            >
              Request account deletion
            </button>
          ) : (
            <div className="mt-3 space-y-3">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                rows={2}
                placeholder="Reason (optional)"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
              />
              <div className="flex gap-3">
                <button
                  onClick={submit}
                  disabled={busy}
                  className="rounded-lg bg-kq-red px-4 py-2 text-sm font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60"
                >
                  {busy ? "Sending…" : "Send deletion request"}
                </button>
                <button onClick={() => setOpen(false)} className="text-sm text-ink-soft hover:underline">
                  Never mind
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-kq-red" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
