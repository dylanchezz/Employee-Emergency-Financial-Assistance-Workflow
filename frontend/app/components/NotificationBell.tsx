"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";

type Notification = {
  notificationId: number;
  requestId: number;
  message: string;
  isRead: boolean;
  sentAt: string;
};

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Load the unread count on mount, and refresh it periodically so new
  // notifications appear without a page reload.
  useEffect(() => {
    let active = true;
    async function loadCount() {
      const res = await apiFetch<{ unread: number }>("/notifications/unread-count");
      if (active && res.ok) setUnread(res.data.unread);
    }
    loadCount();
    const timer = setInterval(loadCount, 20000); // every 20s
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      // Opening: load the full list.
      const res = await apiFetch<Notification[]>("/notifications");
      if (res.ok) setItems(res.data);
    }
  }

  async function openNotification(n: Notification) {
    // Mark it read (optimistically), then go to the request it refers to.
    if (!n.isRead) {
      await apiFetch(`/notifications/${n.notificationId}/read`, { method: "POST" });
      setUnread((u) => Math.max(0, u - 1));
      setItems((list) =>
        list.map((x) =>
          x.notificationId === n.notificationId ? { ...x, isRead: true } : x
        )
      );
    }
    setOpen(false);
    router.push(`/requests/${n.requestId}`);
  }

  async function markAllRead() {
    await apiFetch("/notifications/read-all", { method: "POST" });
    setUnread(0);
    setItems((list) => list.map((x) => ({ ...x, isRead: true })));
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={toggle}
        className="relative rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
        aria-label="Notifications"
      >
        {/* Simple bell glyph */}
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-kq-red px-1 text-xs font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-xl border border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="font-medium text-ink">Notifications</span>
            {items.some((x) => !x.isRead) && (
              <button
                onClick={markAllRead}
                className="text-xs text-kq-red hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Phase 3 (C6): the full list (with Clear all) lives on its own page. */}
          <button
            onClick={() => {
              setOpen(false);
              router.push("/notifications");
            }}
            className="block w-full border-b border-line px-4 py-2 text-left text-xs font-medium text-kq-red hover:bg-canvas"
          >
            View all notifications →
          </button>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-soft">
                No notifications yet.
              </p>
            ) : (
              items.map((n) => (
                <button
                  key={n.notificationId}
                  onClick={() => openNotification(n)}
                  className={`block w-full border-b border-line px-4 py-3 text-left text-sm transition hover:bg-canvas ${
                    n.isRead ? "text-ink-soft" : "text-ink"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-kq-red" />
                    )}
                    <span className={n.isRead ? "" : "font-medium"}>{n.message}</span>
                  </div>
                  <span className="mt-1 block text-xs text-ink-soft">
                    {new Date(n.sentAt).toLocaleString()}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}