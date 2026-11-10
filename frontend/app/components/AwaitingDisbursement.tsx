"use client";

// D2 — Finance's "Awaiting disbursement" list. A request that HR has fully approved (status
// 'Approved') still has to be paid out; a Finance Officer records the payment here and it
// becomes 'Disbursed' (terminal). This is a post-approval step keyed on STATUS — deliberately a
// separate panel from the tier-3 review queue, and styled differently (green, money-out).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";

type AwaitingItem = {
  requestId: number;
  userId: number;
  requesterName: string;
  department: string;
  category: string;
  amount: number;
  priorityLevel: string | null;
  approvedAt: string;
};

export default function AwaitingDisbursement({ myId }: { myId: number | null }) {
  const router = useRouter();
  const [items, setItems] = useState<AwaitingItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  // A failed load must NOT look like an empty list ("Nothing to pay out") — that would tell a
  // Finance officer there's no work when the truth is "couldn't check".
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);   // which row's form is open
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await apiFetch<AwaitingItem[]>("/requests/awaiting-disbursement");
    if (res.ok) {
      setItems(res.data);
      setLoadError("");
    } else {
      setLoadError(res.error);
    }
    setLoaded(true);
  }

  useEffect(() => {
    (async () => {
      const res = await apiFetch<AwaitingItem[]>("/requests/awaiting-disbursement");
      if (res.ok) {
        setItems(res.data);
      } else {
        setLoadError(res.error);
      }
      setLoaded(true);
    })();
  }, []);

  function openForm(id: number) {
    setOpenId(id);
    setReference("");
    setNote("");
    setError("");
    setMessage("");
  }

  async function disburse(item: AwaitingItem) {
    setBusy(true);
    setError("");
    const res = await apiFetch<{ amount: number; reference: string | null }>(
      `/requests/${item.requestId}/disburse`,
      { method: "POST", body: { reference: reference.trim() || null, note: note.trim() || null } }
    );
    setBusy(false);
    if (!res.ok) {
      // e.g. 409 "already disbursed" (another officer was faster) or 403 (own request).
      setError(res.error);
      load();
      return;
    }
    setOpenId(null);
    setMessage(`Request #${item.requestId} disbursed — KES ${res.data.amount.toLocaleString()}.`);
    load();
  }

  return (
    <section className="mt-10">
      <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
        Awaiting disbursement
      </h2>
      <p className="text-sm text-ink-soft">
        Fully approved by HR — record the payment to complete the request. Oldest approval first.
      </p>

      {message && (
        <p className="mt-3 rounded-lg border border-low/30 bg-low/10 px-3.5 py-2.5 text-sm text-low" role="status">
          {message}
        </p>
      )}

      {loadError && (
        <div className="mt-4 rounded-2xl border border-kq-red/30 bg-kq-red/5 p-4 text-sm" role="alert">
          <p className="text-kq-red">Couldn&apos;t load the requests awaiting disbursement: {loadError}</p>
          <button onClick={load} className="mt-2 font-medium text-kq-red hover:underline">
            Try again
          </button>
        </div>
      )}

      {loaded && !loadError && items.length === 0 && (
        <div className="mt-4 rounded-2xl border border-low/30 bg-low/5 p-6 text-center text-sm text-ink-soft">
          Nothing to pay out right now.
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-4 space-y-3">
          {items.map((item) => {
            const isMine = myId != null && item.userId === myId;
            const isOpen = openId === item.requestId;
            return (
              <div
                key={item.requestId}
                className="rounded-2xl border border-low/30 border-l-4 border-l-low bg-surface p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-low/15 px-2.5 py-0.5 text-xs font-semibold text-low">
                        Approved
                      </span>
                      <span className="font-medium text-ink">#{item.requestId}</span>
                      <span className="text-ink">{item.category}</span>
                      {isMine && (
                        <span className="rounded-full bg-ink-soft/15 px-2 py-0.5 text-xs font-semibold text-ink-soft">
                          Your own request
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm text-ink-soft">
                      {item.requesterName} · {item.department} ·{" "}
                      <span className="font-semibold text-ink">KES {item.amount.toLocaleString()}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      Approved {new Date(item.approvedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => router.push(`/requests/${item.requestId}`)}
                      className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
                    >
                      View
                    </button>
                    {/* Own request: separation of duties — the backend refuses it too (403). */}
                    {!isMine && !isOpen && (
                      <button
                        onClick={() => openForm(item.requestId)}
                        className="rounded-lg bg-low px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                      >
                        Disburse
                      </button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 rounded-xl border border-line bg-canvas/40 p-4">
                    <p className="text-sm text-ink">
                      Pay out <span className="font-semibold">KES {item.amount.toLocaleString()}</span> — the
                      approved amount (fixed; no partial payments).
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <input
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        maxLength={100}
                        placeholder="Payment reference (optional)"
                        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                      />
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Internal note (optional)"
                        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                      />
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        onClick={() => disburse(item)}
                        disabled={busy}
                        className="rounded-lg bg-low px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                      >
                        {busy ? "Recording…" : "Confirm disbursement"}
                      </button>
                      <button
                        onClick={() => setOpenId(null)}
                        className="text-sm text-ink-soft hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                    {error && (
                      <p className="mt-2 text-sm text-kq-red" role="alert">
                        {error}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
