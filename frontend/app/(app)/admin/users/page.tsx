"use client";

// Admin → Users (was the "Users" tab of the admin dashboard; now its own page in the sidebar).
// Search + role filter, per-row role/department edits with Save, Reactivate, and Create user.
// ?create=1 opens the create form (the dashboard's "+ Create user" button links here).

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import { LOGIN_PATH } from "@/app/lib/auth";
import { ROLES, type AdminUser, type DepartmentRow } from "@/app/lib/admin";
import AdminOnly from "@/app/components/admin/AdminOnly";
import { PageHeader } from "@/app/components/ui/Ui";

const inputCls =
  "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20";

export default function AdminUsersPage() {
  return (
    <AdminOnly>
      <Suspense fallback={null}>
        <UsersInner />
      </Suspense>
    </AdminOnly>
  );
}

function UsersInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  // Pending role / department edits, keyed by userId (each row's dropdowns are independent).
  const [pendingRole, setPendingRole] = useState<Record<number, string>>({});
  const [pendingDept, setPendingDept] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  // Create-user form.
  const [showCreate, setShowCreate] = useState(() => search.get("create") === "1");
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cRole, setCRole] = useState("Employee");
  const [cDepartment, setCDepartment] = useState("Unassigned");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  const fetchUsers = () => apiFetch<AdminUser[]>("/admin/users");
  const fetchDepartments = () => apiFetch<DepartmentRow[]>("/admin/departments");
  function applyUsers(result: Awaited<ReturnType<typeof fetchUsers>>) {
    setLoading(false);
    if (!result.ok) {
      if (result.status === 401) { router.replace(LOGIN_PATH); return; }
      setError(result.error);
      return;
    }
    setUsers(result.data);
  }
  const reloadUsers = () => fetchUsers().then(applyUsers);
  const reloadDepartments = () => fetchDepartments().then((r) => { if (r.ok) setDepartments(r.data); });

  useEffect(() => {
    fetchUsers().then(applyUsers);
    fetchDepartments().then((r) => { if (r.ok) setDepartments(r.data); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // C2 follow-up: reactivate a deactivated (soft-deleted) account.
  async function reactivate(user: AdminUser) {
    if (!window.confirm(`Reactivate ${user.name} (${user.email})? They will be able to sign in again.`)) return;
    setMessage("");
    setSavingId(user.userId);
    const result = await apiFetch<{ notificationEmailSent: boolean }>(`/admin/users/${user.userId}/reactivate`, { method: "POST" });
    setSavingId(null);
    setMessage(
      result.ok
        ? `${user.name} has been reactivated.${result.data.notificationEmailSent ? " They were emailed." : ""}`
        : result.error
    );
    reloadUsers();
  }

  // Saves whatever changed on the row: role and/or (D1) department.
  async function saveRow(user: AdminUser) {
    const next = pendingRole[user.userId] ?? user.role;
    const nextDept = pendingDept[user.userId] ?? user.department;
    if (next === user.role && nextDept === user.department) return; // nothing changed
    setMessage("");
    setSavingId(user.userId);
    const done: string[] = [];
    if (next !== user.role) {
      const result = await apiFetch<{ userId: number; role: string }>(`/admin/users/${user.userId}/role`, { method: "PUT", body: { role: next } });
      if (!result.ok) { setSavingId(null); setMessage(result.error); return; }
      done.push(`role → ${next}`);
    }
    if (nextDept !== user.department) {
      const result = await apiFetch<{ userId: number; department: string; notificationEmailSent?: boolean }>(
        `/admin/users/${user.userId}/department`, { method: "PUT", body: { department: nextDept } });
      if (!result.ok) { setSavingId(null); setMessage(result.error); return; }
      // Phase 8 (Part C): the backend emails the user on a real admin change (best-effort).
      done.push(`department → ${nextDept}${result.data.notificationEmailSent ? " (user notified by email)" : ""}`);
    }
    setSavingId(null);
    setMessage(`${user.name}: ${done.join(", ")}.`);
    setPendingRole((p) => { const rest = { ...p }; delete rest[user.userId]; return rest; });
    setPendingDept((p) => { const rest = { ...p }; delete rest[user.userId]; return rest; });
    reloadUsers();
    reloadDepartments();
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
      body: { name: cName.trim(), email: cEmail.trim(), password: cPassword, role: cRole, department: cDepartment },
    });
    setCreating(false);
    if (!result.ok) { setCreateMsg(result.error); return; }
    setMessage(`User ${cName.trim()} created as ${cRole}.`);
    setCName(""); setCEmail(""); setCPassword(""); setCRole("Employee"); setCDepartment("Unassigned");
    setShowCreate(false);
    reloadUsers();
    reloadDepartments();
  }

  // Search by name/email + filter by role (client-side; the list is small).
  const q = userQuery.trim().toLowerCase();
  const visibleUsers = users.filter(
    (u) => (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) && (!roleFilter || u.role === roleFilter)
  );
  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Users"
        subtitle={`${users.length} accounts · ${activeCount} active · ${users.length - activeCount} deactivated`}
        actions={!showCreate && (
          <button onClick={() => setShowCreate(true)}
            className="h-10 rounded-lg bg-kq-red px-4 text-sm font-medium text-white transition hover:bg-kq-red-deep">
            + Create user
          </button>
        )}
      />

      {message && <p className="mt-4 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink" role="status">{message}</p>}

      {showCreate && (
        <div className="mt-6 animate-fade-up rounded-2xl border border-line bg-surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">Create a user</h2>
            <button onClick={() => setShowCreate(false)} className="text-sm text-ink-soft hover:text-ink">Cancel</button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Name" id="c-name"><input id="c-name" value={cName} onChange={(e) => setCName(e.target.value)} className={inputCls} /></Field>
            <Field label="Email" id="c-email"><input id="c-email" type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} className={inputCls} /></Field>
            <Field label="Password" id="c-password">
              <input id="c-password" type="password" autoComplete="new-password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Role" id="c-role">
              <select id="c-role" value={cRole} onChange={(e) => setCRole(e.target.value)} className={inputCls}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Department" id="c-dept">
              {/* D1: from the canonical list. A Department Supervisor's department decides which tier-1 queue they see. */}
              <select id="c-dept" value={cDepartment} onChange={(e) => setCDepartment(e.target.value)} className={inputCls}>
                {departments.map((d) => <option key={d.departmentId} value={d.name}>{d.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={createUser} disabled={creating}
              className="h-10 rounded-lg bg-kq-red px-4 text-sm font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60">
              {creating ? "Creating…" : "Create user"}
            </button>
            {createMsg && <p className="text-sm text-kq-red" role="alert">{createMsg}</p>}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Search name or email" aria-label="Search users"
          className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20 sm:max-w-xs" />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role"
          className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20">
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="text-sm text-ink-soft">{visibleUsers.length} of {users.length}</span>
      </div>

      {loading && <p className="mt-6 text-ink-soft">Loading…</p>}
      {error && <p className="mt-6 text-sm text-kq-red">{error}</p>}

      {!loading && !error && (
        // overflow-x-auto (not overflow-hidden): if a row is wider than the card, scroll sideways
        // inside the card instead of silently clipping the action buttons. `relative` keeps the
        // absolutely-positioned sr-only "Actions" label inside this scroll box — without it, that
        // hidden label escaped and made the whole page 628px wide on a phone.
        <div className="relative mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
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
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">
                        {u.name}
                        {!u.isActive && (
                          <span className="ml-2 whitespace-nowrap rounded-full bg-ink-soft/15 px-2 py-0.5 text-xs font-semibold text-ink-soft">Deactivated</span>
                        )}
                      </p>
                      <p className="break-all text-xs text-ink-soft">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {/* D1: admin sets any user's department (users can only choose once). */}
                      <select value={selectedDept} aria-label={`Department for ${u.name}`}
                        onChange={(e) => setPendingDept((p) => ({ ...p, [u.userId]: e.target.value }))}
                        className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20">
                        {departments.map((d) => <option key={d.departmentId} value={d.name}>{d.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select value={selected} aria-label={`Role for ${u.name}`}
                        onChange={(e) => setPendingRole((p) => ({ ...p, [u.userId]: e.target.value }))}
                        className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20">
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        <button onClick={() => saveRow(u)} disabled={!changed || savingId === u.userId}
                          className={`h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition disabled:opacity-40 ${
                            changed ? "bg-kq-red text-white hover:bg-kq-red-deep" : "border border-line text-ink hover:bg-canvas"
                          }`}>
                          {savingId === u.userId ? "Saving…" : "Save"}
                        </button>
                        {/* C2 follow-up: undo a deactivation (soft-delete kept everything). */}
                        {!u.isActive && (
                          <button onClick={() => reactivate(u)} disabled={savingId === u.userId}
                            className="h-9 whitespace-nowrap rounded-lg border border-low px-3 text-sm font-medium text-low-text transition hover:bg-low hover:text-white disabled:opacity-40">
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
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-ink-soft">{label}</label>
      {children}
    </div>
  );
}
