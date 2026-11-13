"use client";

// Activity as a compact timeline (time · action · actor · the requests it touched), one line per
// group of consecutive identical entries (grouping: lib/audit.ts). Used by the admin dashboard's
// "Latest activity" and the /admin/activity page.

import { useRouter } from "next/navigation";
import type { AuditEntry } from "@/app/lib/admin";
import type { Collapsed } from "@/app/lib/audit";
import { formatDateTime } from "@/app/lib/format";

export default function ActivityList({ items }: { items: Collapsed<AuditEntry>[] }) {
  const router = useRouter();
  if (items.length === 0) return <p className="mt-4 text-sm text-ink-soft">No activity to show.</p>;
  return (
    <ol className="mt-4 divide-y divide-line">
      {items.map((c) => (
        <li key={c.first.logId} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
          <span className="w-40 shrink-0 text-xs text-ink-soft sm:pt-0.5">{formatDateTime(c.first.loggedAt)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">
              {c.first.action}
              {c.count > 1 && (
                <span className="ml-1.5 whitespace-nowrap rounded-full bg-medium/15 px-2 py-0.5 text-xs font-semibold text-medium-text">
                  ×{c.count}
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {c.first.actorName ?? "System"}
              {c.count > 1 && formatDateTime(c.last.loggedAt) !== formatDateTime(c.first.loggedAt) && (
                <> · until {formatDateTime(c.last.loggedAt)}</>
              )}
            </p>
            {/* The requests this line touched (unique, in order). */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...new Set(c.rows.map((r) => r.requestId))].map((id) => (
                <button key={id} onClick={() => router.push(`/requests/${id}`)}
                  className="rounded-full bg-kq-red/10 px-2.5 py-0.5 text-xs font-semibold text-kq-red transition hover:bg-kq-red/20">
                  #{id}
                </button>
              ))}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
