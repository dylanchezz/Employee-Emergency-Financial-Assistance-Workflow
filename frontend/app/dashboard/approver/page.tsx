"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";

type QueueItem = {
  requestId: number;
  requesterName: string;
  category: string;
  amount: number;
  status: string;
  currentTier: number;
  priorityLevel: string | null;
  validationNote: string | null;
  createdAt: string;
};

// Priority → badge colour (using the theme status tokens).
const PRIORITY_STYLES: Record<string, string> = {
  High: "bg-high text-white",
  Medium: "bg-medium text-white",
  Low: "bg-low text-white",
};

const STATUS_STYLES: Record<string, string> = {
  "In Review": "bg-medium/15 text-medium",
  Approved: "bg-low/15 text-low",
  Rejected: "bg-kq-red/15 text-kq-red",
  Returned: "bg-ink-soft/15 text-ink-soft",
};

export default function ApproverDashboard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [decided, setDecided] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/");
      return;
    }
    setName(localStorage.getItem("name") ?? "");
    setRole(localStorage.getItem("role") ?? "");

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

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("name");
    router.replace("/");
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">
              Approver Dashboard
            </h1>
            <p className="mt-1 text-ink-soft">
              {name} · {role}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-ink-soft hover:text-ink transition"
          >
            Sign out
          </button>
        </div>

        <h2 className="mt-8 font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
          Requests awaiting your review
        </h2>
        <p className="text-sm text-ink-soft">Ordered by predicted priority.</p>

        {loading && <p className="mt-6 text-ink-soft">Loading…</p>}
        {error && <p className="mt-6 text-sm text-kq-red">{error}</p>}

        {!loading && !error && queue.length === 0 && (
          <div className="mt-6 rounded-2xl border border-line bg-surface p-8 text-ink-soft">
            Your queue is empty.
          </div>
        )}

        {queue.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-ink-soft">
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Request</th>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Amount (KES)</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.requestId} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          item.priorityLevel
                            ? PRIORITY_STYLES[item.priorityLevel] ?? "bg-ink-soft text-white"
                            : "bg-line text-ink-soft"
                        }`}
                      >
                        {item.priorityLevel ?? "Unclassified"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink">#{item.requestId}</td>
                    <td className="px-4 py-3 text-ink">{item.requesterName}</td>
                    <td className="px-4 py-3 text-ink">{item.category}</td>
                    <td className="px-4 py-3 text-ink">
                      {item.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => router.push(`/requests/${item.requestId}`)}
                        className="rounded-lg border border-kq-red px-3 py-1.5 text-sm font-medium text-kq-red transition hover:bg-kq-red hover:text-white"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                      STATUS_STYLES[item.status] ?? "bg-ink-soft/15 text-ink-soft"
                    }`}
                  >
                    {item.status}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}