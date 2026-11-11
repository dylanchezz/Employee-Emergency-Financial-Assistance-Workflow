"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DeletionRequestsQueue from "@/app/components/DeletionRequestsQueue";
import AttentionPanel from "@/app/components/admin/AttentionPanel";
import AnalyticsPanel from "@/app/components/admin/AnalyticsPanel";
import { apiFetch } from "@/app/lib/api";
import { useSession } from "@/app/lib/session";
import { LOGIN_PATH } from "@/app/lib/auth";
import { formatDateTime } from "@/app/lib/format";
import { collapseRepeats } from "@/app/lib/audit";
import { StatTile } from "@/app/components/ui/Ui";
import { CheckCircleIcon, FolderIcon, UserIcon, XCircleIcon } from "@/app/components/icons";

// The six roles the backend/schema allow. The dropdowns offer exactly these.
const ROLES = [
  "Employee",
  "Department Supervisor",
  "Welfare Officer",
  "Finance Officer",
  "HR Manager",
  "System Administrator",
];

type AdminUser = {
  userId: number;
  name: string;
  email: string;
  role: string;
  department: string;
  createdAt: string;
  isActive: boolean;   // C2: false = deactivated (soft-deleted)
};

// D1: one row of the canonical departments list.
type DepartmentRow = {
  departmentId: number;
  name: string;
  createdAt: string;
  userCount: number;
};

type ValidationRule = {
  name: string;
  value: string;
  effect: string;
};

type AuditEntry = {
  logId: number;
  requestId: number;
  actorId: number | null;
  actorName: string | null;
  action: string;
  loggedAt: string;
};

// Phase 8 (UI pass): the dashboard was one long column of eight sections. It is now split into
// tabs (deep-linkable as ?tab=…) with a short Overview first. Same data, same actions.
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "departments", label: "Departments" },
  { id: "requests", label: "Account requests" },
  { id: "rules", label: "Rules" },
  { id: "activity", label: "Activity" },
] as const;
type TabId = (typeof TABS)[number]["id"];
const ACTIVITY_PAGE = 15;

// useSearchParams needs a Suspense boundary in the App Router.
export default function AdminDashboard() {
  return (
    <Suspense fallback={null}>
      <AdminDashboardInner />
    </Suspense>
  );
}

function AdminDashboardInner() {
  const router = useRouter();
  // Phase 3: name/role from the shared session hook (the shell already guards sign-in).
  const { name, role } = useSession();
  const search = useSearchParams();
  const tabParam = search.get("tab");
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "overview";
  const setTab = (id: TabId) =>
    router.replace(id === "overview" ? "/dashboard/admin" : `/dashboard/admin?tab=${id}`, { scroll: false });
  const [userQuery, setUserQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activityQuery, setActivityQuery] = useState("");
  const [activityShown, setActivityShown] = useState(ACTIVITY_PAGE);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [rules, setRules] = useState<ValidationRule[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Pending role edits, keyed by userId (so each row's dropdown is independent).
  const [pendingRole, setPendingRole] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  // Create-user form.
  const [showCreate, setShowCreate] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cRole, setCRole] = useState("Employee");
  const [cDepartment, setCDepartment] = useState("Unassigned");

  // D1: departments (list + create) and per-row pending department edits.
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [pendingDept, setPendingDept] = useState<Record<number, string>>({});
  const [newDept, setNewDept] = useState("");
  const [deptMsg, setDeptMsg] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  async function loadUsers() {
    const result = await apiFetch<AdminUser[]>("/admin/users");
    setLoading(false);
    if (!result.ok) {
      if (result.status === 401) {
        router.replace(LOGIN_PATH);
        return;
      }
      setError(result.error);
      return;
    }
    setUsers(result.data);
  }
  async function loadDepartments() {
    const result = await apiFetch<DepartmentRow[]>("/admin/departments");
    if (result.ok) setDepartments(result.data);
  }

  async function createDepartment() {
    setDeptMsg("");
    const deptName = newDept.trim();
    if (!deptName) return;
    const result = await apiFetch<DepartmentRow>("/admin/departments", {
      method: "POST",
      body: { name: deptName },
    });
    if (!result.ok) {
      setDeptMsg(result.error);
      return;
    }
    setDeptMsg(`Department "${result.data.name}" created.`);
    setNewDept("");
    loadDepartments();
  }

    async function loadRules() {
    const result = await apiFetch<ValidationRule[]>("/admin/rules");
    if (result.ok) setRules(result.data);
  }
    // Phase 6: the attention list + reminder "nudge" moved into components/admin/AttentionPanel.
    async function loadAudit() {
    const result = await apiFetch<AuditEntry[]>("/admin/audit");
    if (result.ok) setAudit(result.data);
  }

  useEffect(() => {
    loadUsers();
    loadDepartments();
    loadRules();
    loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);


  // C2 follow-up: reactivate a deactivated (soft-deleted) account.
  async function reactivate(user: AdminUser) {
    if (!window.confirm(`Reactivate ${user.name} (${user.email})? They will be able to sign in again.`)) return;
    setMessage("");
    setSavingId(user.userId);
    const result = await apiFetch<{ notificationEmailSent: boolean }>(
      `/admin/users/${user.userId}/reactivate`,
      { method: "POST" }
    );
    setSavingId(null);
    setMessage(
      result.ok
        ? `${user.name} has been reactivated.${result.data.notificationEmailSent ? " They were emailed." : ""}`
        : result.error
    );
    loadUsers();
  }

  // Saves whatever changed on the row: role and/or (D1) department.
  async function saveRole(user: AdminUser) {
    const next = pendingRole[user.userId] ?? user.role;
    const nextDept = pendingDept[user.userId] ?? user.department;
    if (next === user.role && nextDept === user.department) return; // nothing changed
    setMessage("");
    setSavingId(user.userId);
    const done: string[] = [];
    if (next !== user.role) {
      const result = await apiFetch<{ userId: number; role: string }>(
        `/admin/users/${user.userId}/role`,
        { method: "PUT", body: { role: next } }
      );
      if (!result.ok) {
        setSavingId(null);
        setMessage(result.error);
        return;
      }
      done.push(`role → ${next}`);
    }
    if (nextDept !== user.department) {
      const result = await apiFetch<{ userId: number; department: string; notificationEmailSent?: boolean }>(
        `/admin/users/${user.userId}/department`,
        { method: "PUT", body: { department: nextDept } }
      );
      if (!result.ok) {
        setSavingId(null);
        setMessage(result.error);
        return;
      }
      // Phase 8 (Part C): the backend emails the user on a real admin change (best-effort).
      done.push(`department → ${nextDept}${result.data.notificationEmailSent ? " (user notified by email)" : ""}`);
    }
    setSavingId(null);
    setMessage(`${user.name}: ${done.join(", ")}.`);
    setPendingDept((p) => {
      const rest = { ...p };
      delete rest[user.userId];
      return rest;
    });
    loadUsers();
    loadDepartments();
  }

  async function createUser() {
    setCreateMsg("");
    if (!cName.trim() || !cEmail.trim() || !cPassword.trim()) {
      setCreateMsg("Name, email, and password are required.");
      return;
    }
    setCreating(true);
    const result = await apiFetch<{ userId: number }>("/admin/users", {
      method: "POST",
      body: {
        name: cName.trim(),
        email: cEmail.trim(),
        password: cPassword,
        role: cRole,
        department: cDepartment,
      },
    });
    setCreating(false);
    if (!result.ok) {
      setCreateMsg(result.error);
      return;
    }
    setCreateMsg(`User ${cName.trim()} created as ${cRole}.`);
    setCName("");
    setCEmail("");
    setCPassword("");
    setCRole("Employee");
    setCDepartment("Unassigned");
    setShowCreate(false);
    loadUsers();
  }

  // Users tab: search by name/email + filter by role (client-side; the list is small).
  const q = userQuery.trim().toLowerCase();
  const visibleUsers = users.filter(
    (u) => (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) && (!roleFilter || u.role === roleFilter)
  );
  const activeCount = users.filter((u) => u.isActive).length;

  // Activity: filter first (by #request / person / text), then collapse CONSECUTIVE identical lines —
  // even across different requests (the escalation worker writes the same line for many requests in
  // one pass) — into one line listing the requests it touched. Then paged.
  const aq = activityQuery.trim().toLowerCase().replace(/^#/, "");
  const activity = collapseRepeats(
    audit.filter(
      (e) =>
        !aq ||
        String(e.requestId) === aq ||
        (e.actorName ?? "system").toLowerCase().includes(aq) ||
        e.action.toLowerCase().includes(aq)
    ),
    (e) => `${e.actorName ?? ""}|${e.action}`
  );

  return (
    // Phase 3: content inside the AppShell — bell / 2FA / Sign out moved to the shell's navbar
    // and the Profile page; the shell provides the <main>.
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">Administrator dashboard</h1>
          <p className="mt-1 text-ink-soft">Signed in as {name} · {role}</p>
        </div>
        <button
          onClick={() => { setTab("users"); setShowCreate(true); }}
          className="h-10 rounded-lg bg-kq-red px-4 text-sm font-medium text-white transition hover:bg-kq-red-deep"
        >
          + Create user
        </button>
      </header>

      {/* At-a-glance tiles (from data the page already loads). */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Users" value={users.length} icon={UserIcon} iconTone="bg-kq-red/10 text-kq-red" onClick={() => setTab("users")} />
        <StatTile label="Active accounts" value={activeCount} icon={CheckCircleIcon} tone="text-low-text" iconTone="bg-low/15 text-low-text" onClick={() => setTab("users")} />
        <StatTile label="Deactivated" value={users.length - activeCount} icon={XCircleIcon} tone="text-ink-soft" onClick={() => setTab("users")} />
        <StatTile label="Departments" value={departments.length} icon={FolderIcon} onClick={() => setTab("departments")} />
      </div>

      {/* Tabs — the strip scrolls sideways on its own on a phone, never the page. */}
      <div className="sticky top-16 z-10 -mx-4 mt-6 border-b border-line bg-canvas/95 px-4 backdrop-blur md:-mx-8 md:px-8">
        <div role="tablist" aria-label="Admin sections" className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`h-11 shrink-0 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition ${
                tab === t.id ? "border-kq-red text-kq-red" : "border-transparent text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {message && <p className="mt-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink" role="status">{message}</p>}

      {tab === "overview" && (
        <div className="animate-fade-up">
          {/* Phase 6 (F1 + F2): grouped by priority, each with its own audit box. */}
          <AttentionPanel />
          {/* Phase 6 (F3, F4, F5, F7, F8): active users, users by role, per-department requests, CSVs. */}
          <AnalyticsPanel />
          <section className="mt-8 rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">Latest activity</h2>
              <button onClick={() => setTab("activity")} className="text-sm font-medium text-kq-red hover:underline">
                View all activity →
              </button>
            </div>
            <ActivityList items={activity.slice(0, 5)} onOpen={(id) => router.push(`/requests/${id}`)} />
          </section>
        </div>
      )}

      {tab === "users" && (
        <section className="mt-6 animate-fade-up">
          {showCreate && (
            <div className="mb-6 rounded-2xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">Create a user</h2>
                <button onClick={() => setShowCreate(false)} className="text-sm text-ink-soft hover:text-ink">Cancel</button>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Name">
                  <input value={cName} onChange={(e) => setCName(e.target.value)}
                    className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20" />
                </Field>
                <Field label="Email">
                  <input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)}
                    className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20" />
                </Field>
                <Field label="Password">
                  <input type="password" autoComplete="new-password" value={cPassword} onChange={(e) => setCPassword(e.target.value)}
                    className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20" />
                </Field>
                <Field label="Role">
                  <select value={cRole} onChange={(e) => setCRole(e.target.value)}
                    className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="Department">
                  {/* D1: from the canonical list. A Department Supervisor's department decides
                      which tier-1 queue they see. */}
                  <select value={cDepartment} onChange={(e) => setCDepartment(e.target.value)}
                    className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20">
                    {departments.map((d) => <option key={d.departmentId} value={d.name}>{d.name}</option>)}
                  </select>
                </Field>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button onClick={createUser} disabled={creating}
                  className="h-10 rounded-lg bg-kq-red px-4 text-sm font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60">
                  {creating ? "Creating…" : "Create user"}
                </button>
                {createMsg && <p className="text-sm text-ink">{createMsg}</p>}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Search name or email"
              aria-label="Search users"
              className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20 sm:max-w-xs"
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter by role"
              className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
            >
              <option value="">All roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <span className="text-sm text-ink-soft">{visibleUsers.length} of {users.length}</span>
            {!showCreate && (
              <button onClick={() => setShowCreate(true)}
                className="ml-auto h-10 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink transition hover:bg-canvas">
                + Create user
              </button>
            )}
          </div>

          {loading && <p className="mt-6 text-ink-soft">Loading…</p>}
          {error && <p className="mt-6 text-sm text-kq-red">{error}</p>}

          {/* Users table */}
          {!loading && !error && (
            // overflow-x-auto (not overflow-hidden): if the row is wider than the card, scroll
            // sideways instead of silently clipping the action buttons.
            <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-canvas/60 text-xs uppercase tracking-wider text-ink-soft">
                  <tr>
                    <th className="px-4 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Department</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-soft">No users match this search.</td></tr>
                  )}
                  {visibleUsers.map((u) => {
                    const selected = pendingRole[u.userId] ?? u.role;
                    const selectedDept = pendingDept[u.userId] ?? u.department;
                    const changed = selected !== u.role || selectedDept !== u.department;
                    return (
                      <tr key={u.userId} className="border-b border-line transition last:border-0 hover:bg-canvas/50">
                        {/* Name + email share one column (email underneath, may break at any
                            character) so the row fits the card next to the two dropdowns and the
                            action buttons — a long address used to push Reactivate out of view. */}
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">
                            {u.name}
                            {!u.isActive && (
                              <span className="ml-2 whitespace-nowrap rounded-full bg-ink-soft/15 px-2 py-0.5 text-xs font-semibold text-ink-soft">
                                Deactivated
                              </span>
                            )}
                          </p>
                          <p className="break-all text-xs text-ink-soft">{u.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          {/* D1: admin sets any user's department (users can only choose once). */}
                          <select
                            value={selectedDept}
                            aria-label={`Department for ${u.name}`}
                            onChange={(e) => setPendingDept((p) => ({ ...p, [u.userId]: e.target.value }))}
                            className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                          >
                            {departments.map((d) => <option key={d.departmentId} value={d.name}>{d.name}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={selected}
                            aria-label={`Role for ${u.name}`}
                            onChange={(e) => setPendingRole((p) => ({ ...p, [u.userId]: e.target.value }))}
                            className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                          >
                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {/* Buttons stacked (not side by side) so the actions column stays narrow. */}
                          <div className="flex flex-col items-end gap-1.5">
                            <button
                              onClick={() => saveRole(u)}
                              disabled={!changed || savingId === u.userId}
                              className={`h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition disabled:opacity-40 ${
                                changed ? "bg-kq-red text-white hover:bg-kq-red-deep" : "border border-line text-ink hover:bg-canvas"
                              }`}
                            >
                              {savingId === u.userId ? "Saving…" : "Save"}
                            </button>
                            {/* C2 follow-up: undo a deactivation (soft-delete kept everything). */}
                            {!u.isActive && (
                              <button
                                onClick={() => reactivate(u)}
                                disabled={savingId === u.userId}
                                className="h-9 whitespace-nowrap rounded-lg border border-low px-3 text-sm font-medium text-low-text transition hover:bg-low hover:text-white disabled:opacity-40"
                              >
                                Reactivate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "departments" && (
        <section className="mt-6 animate-fade-up">
          {/* D1: departments — minimal management (list + create). */}
          <p className="max-w-3xl text-sm text-ink-soft">
            A Department Supervisor reviews only requests from their own department (tier 1);
            Welfare, Finance and HR see all departments. &quot;Unassigned&quot; holds accounts that
            haven&apos;t chosen yet — they must choose before submitting.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              placeholder="New department name"
              aria-label="New department name"
              maxLength={100}
              className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
            />
            <button
              onClick={createDepartment}
              disabled={!newDept.trim()}
              className="h-10 rounded-lg bg-kq-red px-4 text-sm font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60"
            >
              + Add department
            </button>
            {deptMsg && <p className="text-sm text-ink">{deptMsg}</p>}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map((d) => (
              <div key={d.departmentId} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4">
                <span className="min-w-0 font-medium text-ink">{d.name}</span>
                <span className="shrink-0 rounded-full bg-canvas px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
                  {d.userCount} user{d.userCount === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "requests" && (
        <div className="animate-fade-up">
          {/* C2: account-deletion requests (approve = soft-delete). */}
          <DeletionRequestsQueue onChanged={loadUsers} />
        </div>
      )}

      {tab === "rules" && (
        <section className="mt-6 animate-fade-up">
          {/* Validation rules — read-only view of the current thresholds. */}
          <p className="text-sm text-ink-soft">
            The current rule thresholds applied to every submission. These are read-only;
            adjusting them at runtime is planned future work.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {rules.map((r) => (
              <div key={r.name} className="rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium text-ink">{r.name}</span>
                  <span className="shrink-0 rounded-full bg-kq-red/10 px-2.5 py-0.5 text-sm font-semibold text-kq-red">{r.value}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.effect}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "activity" && (
        <section className="mt-6 animate-fade-up">
          {/* Recent activity — the unified audit trail across all requests (latest 100 entries). */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={activityQuery}
              onChange={(e) => { setActivityQuery(e.target.value); setActivityShown(ACTIVITY_PAGE); }}
              placeholder="Filter by #request, person or action"
              aria-label="Filter activity"
              className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20 sm:max-w-sm"
            />
            <span className="text-sm text-ink-soft">
              {activity.length} line{activity.length === 1 ? "" : "s"} from the latest {audit.length} entries (repeats grouped)
            </span>
          </div>
          <div className="mt-4 rounded-2xl border border-line bg-surface p-6">
            <ActivityList items={activity.slice(0, activityShown)} onOpen={(id) => router.push(`/requests/${id}`)} />
            {activity.length > activityShown && (
              <button
                onClick={() => setActivityShown((n) => n + ACTIVITY_PAGE)}
                className="mt-4 h-10 w-full rounded-lg border border-line text-sm font-medium text-ink transition hover:bg-canvas"
              >
                Show more ({activity.length - activityShown} more)
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// Activity as a compact timeline (time · actor · action · #request), one line per collapsed group.
function ActivityList({
  items, onOpen,
}: {
  items: { first: AuditEntry; last: AuditEntry; count: number; rows: AuditEntry[] }[];
  onOpen: (requestId: number) => void;
}) {
  if (items.length === 0) return <p className="mt-4 text-sm text-ink-soft">No activity to show.</p>;
  return (
    <ol className="mt-4 divide-y divide-line">
      {items.map((c) => (
        <li key={c.first.logId} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
          <span className="w-40 shrink-0 text-xs text-ink-soft sm:pt-0.5">
            {formatDateTime(c.first.loggedAt)}
          </span>
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
                <button key={id} onClick={() => onOpen(id)}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm text-ink-soft">{label}</label>
      {children}
    </div>
  );
}