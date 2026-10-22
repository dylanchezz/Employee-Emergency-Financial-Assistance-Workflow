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

export default function ApproverDashboard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
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
      </div>
    </main>
  );
}