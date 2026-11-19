"use client";

// Admin → Users → History: one user's complete request history (every request, every decision,
// deferral, payout and the activity trail) — the same component approvers see on a request page.

import Link from "next/link";
import { useParams } from "next/navigation";
import AdminOnly from "@/app/components/admin/AdminOnly";
import RequesterHistory from "@/app/components/RequesterHistory";

export default function AdminUserHistoryPage() {
  const params = useParams();
  const userId = Number(params.id);

  return (
    <AdminOnly>
      <div className="mx-auto w-full max-w-5xl">
        <Link href="/admin/users" className="text-sm text-ink-soft transition hover:text-ink">
          ← Back to users
        </Link>
        <div className="mt-4">
          {Number.isInteger(userId) && userId > 0 ? (
            <RequesterHistory userId={userId} />
          ) : (
            <p className="text-sm text-kq-red">Invalid user.</p>
          )}
        </div>
      </div>
    </AdminOnly>
  );
}
