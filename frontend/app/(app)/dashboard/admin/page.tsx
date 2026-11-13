"use client";

// Admin dashboard — the OVERVIEW only.
// Phase 8 follow-up: Users, Departments, Account requests, Rules and Activity moved out of this page
// (they were tabs) into their own pages under /admin/…, reachable from the sidebar. This page keeps
// the at-a-glance tiles (each linking to its page), "Needs your attention", Analytics and the latest
// activity. Old ?tab=… links are redirected to the matching page.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AttentionPanel from "@/app/components/admin/AttentionPanel";
import AnalyticsPanel from "@/app/components/admin/AnalyticsPanel";
import ActivityList from "@/app/components/admin/ActivityList";
import AdminOnly from "@/app/components/admin/AdminOnly";
import { apiFetch } from "@/app/lib/api";
import { useSession } from "@/app/lib/session";
import { LOGIN_PATH } from "@/app/lib/auth";
import { collapseRepeats } from "@/app/lib/audit";
import type { AdminUser, AuditEntry, DepartmentRow } from "@/app/lib/admin";
import { PageHeader, StatTile } from "@/app/components/ui/Ui";
import { CheckCircleIcon, FolderIcon, UserIcon, XCircleIcon } from "@/app/components/icons";

// Where each old tab now lives (keeps bookmarks / old links working).
const OLD_TABS: Record<string, string> = {
  users: "/admin/users",
  departments: "/admin/departments",
  requests: "/admin/account-requests",
  rules: "/admin/rules",
  activity: "/admin/activity",
};

export default function AdminDashboard() {
  return (
    <AdminOnly>
      <Suspense fallback={null}>
        <AdminOverview />
      </Suspense>
    </AdminOnly>
  );
}

function AdminOverview() {
  const router = useRouter();
  // Phase 3: name/role from the shared session hook (the shell already guards sign-in).
  const { name, role } = useSession();
  const oldTab = useSearchParams().get("tab");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  // An old /dashboard/admin?tab=… link → the new page (navigation only, no state).
  useEffect(() => {
    if (oldTab && OLD_TABS[oldTab]) router.replace(OLD_TABS[oldTab]);
  }, [oldTab, router]);

  useEffect(() => {
    apiFetch<AdminUser[]>("/admin/users").then((r) => {
      if (r.ok) setUsers(r.data);
      else if (r.status === 401) router.replace(LOGIN_PATH);
    });
    apiFetch<DepartmentRow[]>("/admin/departments").then((r) => { if (r.ok) setDepartments(r.data); });
    apiFetch<AuditEntry[]>("/admin/audit").then((r) => { if (r.ok) setAudit(r.data); });
  }, [router]);

  const activeCount = users.filter((u) => u.isActive).length;
  const latest = collapseRepeats(audit, (e) => `${e.actorName ?? ""}|${e.action}`).slice(0, 5);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Administrator dashboard"
        subtitle={<>Signed in as {name} · {role}</>}
        actions={
          <Link href="/admin/users?create=1"
            className="flex h-10 items-center rounded-lg bg-kq-red px-4 text-sm font-medium text-white transition hover:bg-kq-red-deep">
            + Create user
          </Link>
        }
      />

      {/* At-a-glance tiles — each opens its page. */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Users" value={users.length} icon={UserIcon} iconTone="bg-kq-red/10 text-kq-red" href="/admin/users" />
        <StatTile label="Active accounts" value={activeCount} icon={CheckCircleIcon} tone="text-low-text" iconTone="bg-low/15 text-low-text" href="/admin/users" />
        <StatTile label="Deactivated" value={users.length - activeCount} icon={XCircleIcon} tone="text-ink-soft" href="/admin/users" />
        <StatTile label="Departments" value={departments.length} icon={FolderIcon} href="/admin/departments" />
      </div>

      {/* Phase 6 (F1 + F2): grouped by priority, each with its own audit box. */}
      <AttentionPanel />
      {/* Phase 6 (F3, F4, F5, F7, F8): active users, users by role, per-department requests, CSVs. */}
      <AnalyticsPanel />

      <section className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">Latest activity</h2>
          <Link href="/admin/activity" className="text-sm font-medium text-kq-red hover:underline">View all activity →</Link>
        </div>
        <ActivityList items={latest} />
      </section>
    </div>
  );
}
