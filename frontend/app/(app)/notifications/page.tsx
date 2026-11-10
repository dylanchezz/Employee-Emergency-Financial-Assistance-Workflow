"use client";

// Phase 3 — C6: Notifications as a full page in the sidebar (the bell's dropdown shows the latest;
// this is the whole list) + "Clear all". Clear-all DELETES the caller's own in-system rows
// (build decision 3) — the permanent record is audit_logs, which is never touched.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/api";

type Notification = {
  notificationId: number;
  requestId: number;
  message: string;
  isRead: boolean;
  sentAt: string;
};

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const res = await apiFetch<Notification[]>("/notifications");
    setLoaded(true);
    if (res.ok) {
      setItems(res.data);
      setError("");
    } else {
      setError(res.error);
    }
  }

  useEffect(() => {
    apiFetch<Notification[]>("/notifications").then((res) => {
      setLoaded(true);
      if (res.ok) setItems(res.data);
      else setError(res.error);
    });
  }, []);

  async function open(n: Notification) {
    if (!n.isRead) await apiFetch(`/notifications/${n.notificationId}/read`, { method: "POST" });
    router.push(`/requests/${n.requestId}`);
  }

  async function markAllRead() {
    await apiFetch("/notifications/read-all", { method: "POST" });
    load();
  }

  async function clearAll() {
    if (!window.confirm("Clear all your notifications? This removes them from your list for good.")) return;
    const res = await apiFetch<{ cleared: number }>("/notifications", { method: "DELETE" });
    setMessage(res.ok ? `Cleared ${res.data.cleared} notification${res.data.cleared === 1 ? "" : "s"}.` : res.error);
    load();
  }

  const unread = items.filter((n) => !n.isRead).length;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">Notifications</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {items.length} total · {unread} unread
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={markAllRead} disabled={unread === 0}
            className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-canvas disabled:opacity-40">
            Mark all read
          </button>
          <button onClick={clearAll} disabled={items.length === 0}
            className="rounded-lg border border-kq-red px-3 py-2 text-sm font-medium text-kq-red transition hover:bg-kq-red hover:text-white disabled:opacity-40">
            Clear all
          </button>
        </div>
      </div>

      {message && <p className="mt-4 text-sm text-ink" role="status">{message}</p>}
      {error && <p className="mt-4 text-sm text-kq-red" role="alert">{error}</p>}
      {!loaded && <p className="mt-6 text-ink-soft">Loading…</p>}
      {loaded && !error && items.length === 0 && (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-10 text-center">
          <p className="font-medium text-ink">You&apos;re all caught up.</p>
          <p className="mt-1 text-sm text-ink-soft">New notifications about your requests will appear here.</p>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
        {items.map((n) => (
          <button key={n.notificationId} onClick={() => open(n)}
            className={`flex w-full items-start gap-3 border-b border-line px-5 py-4 text-left last:border-0 transition hover:bg-canvas ${n.isRead ? "text-ink-soft" : "text-ink"}`}>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.isRead ? "bg-transparent" : "bg-kq-red"}`} />
            <span className="min-w-0 flex-1">
              <span className={n.isRead ? "" : "font-medium"}>{n.message}</span>
              <span className="mt-1 block text-xs text-ink-soft">
                Request #{n.requestId} · {new Date(n.sentAt).toLocaleString()}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
