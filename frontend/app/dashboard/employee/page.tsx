"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";

type MyRequest = {
  requestId: number;
  category: string;
  amount: number;
  status: string;
  priorityLevel: string | null;
  createdAt: string;
};

const PRIORITY_STYLES: Record<string, string> = {
  High: "bg-high text-white",
  Medium: "bg-medium text-white",
  Low: "bg-low text-white",
};

// Status → a small coloured pill.
const STATUS_STYLES: Record<string, string> = {
  "In Review": "bg-medium/15 text-medium",
  Approved: "bg-low/15 text-low",
  Rejected: "bg-kq-red/15 text-kq-red",
  Returned: "bg-ink-soft/15 text-ink-soft",
};

export default function EmployeeDashboard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/");
      return;
    }
    setName(localStorage.getItem("name") ?? "");

    (async () => {
      const result = await apiFetch<MyRequest[]>("/requests/mine");
      setLoading(false);
      if (!result.ok) {
        if (result.status === 401) {
          router.replace("/");
          return;
        }
        setError(result.error);
        return;
      }
      setRequests(result.data);
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
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">
              Employee Dashboard
            </h1>
            <p className="mt-1 text-ink-soft">Signed in as {name}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-ink-soft hover:text-ink transition"
          >
            Sign out
          </button>
        </div>

        <div className="mt-8 flex items-center justify-between rounded-2xl border border-line bg-surface p-6">
          <div>
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
              Need assistance?
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Submit an emergency financial assistance request.
            </p>
          </div>
          <button
            onClick={() => router.push("/requests/new")}
            className="rounded-lg bg-kq-red px-5 py-2.5 font-medium text-white transition hover:bg-kq-red-deep"
          >
            + New request
          </button>
        </div>

        <h2 className="mt-8 font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
          Your requests
        </h2>

        {loading && <p className="mt-4 text-ink-soft">Loading…</p>}
        {error && <p className="mt-4 text-sm text-kq-red">{error}</p>}

        {!loading && !error && requests.length === 0 && (
          <div className="mt-4 rounded-2xl border border-line bg-surface p-8 text-ink-soft">
            You haven&apos;t submitted any requests yet.
          </div>
        )}

        {requests.length > 0 && (
          <div className="mt-4 space-y-3">
            {requests.map((r) => (
              <button
                key={r.requestId}
                onClick={() => router.push(`/requests/${r.requestId}`)}
                className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface p-5 text-left transition hover:border-kq-red/40"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">#{r.requestId}</span>
                    <span className="text-ink">{r.category}</span>
                    {r.priorityLevel && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          PRIORITY_STYLES[r.priorityLevel] ?? "bg-ink-soft text-white"
                        }`}
                      >
                        {r.priorityLevel}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">
                    KES {r.amount.toLocaleString()}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    STATUS_STYLES[r.status] ?? "bg-ink-soft/15 text-ink-soft"
                  }`}
                >
                  {r.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}