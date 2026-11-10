"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NotificationBell from "../../components/NotificationBell";
import TwoFactorToggle from "../../components/TwoFactorToggle";
import { apiFetch } from "../../lib/api";

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

type AttentionItem = {
  requestId: number;
  requesterName: string;
  category: string;
  amount: number;
  status: string;
  currentTier: number;
  since: string;
  officerName: string | null;
  officerEmail: string | null;
};
type AuditEntry = {
  logId: number;
  requestId: number;
  actorId: number | null;
  actorName: string | null;
  action: string;
  loggedAt: string;
};

export default function AdminDashboard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [rules, setRules] = useState<ValidationRule[]>([]);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [nudgeMsg, setNudgeMsg] = useState<Record<number, string>>({});
  const [nudgingId, setNudgingId] = useState<number | null>(null);
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
        router.replace("/");
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
    async function loadAttention() {
    const result = await apiFetch<AttentionItem[]>("/admin/attention");
    if (result.ok) setAttention(result.data);
  }
    async function nudge(requestId: number) {
    setNudgingId(requestId);
    setNudgeMsg((m) => ({ ...m, [requestId]: "" }));
    const result = await apiFetch<{ message: string }>(
      `/admin/attention/${requestId}/nudge`,
      { method: "POST" }
    );
    setNudgingId(null);
    setNudgeMsg((m) => ({
      ...m,
      [requestId]: result.ok ? result.data.message : result.error,
    }));
  }
    async function loadAudit() {
    const result = await apiFetch<AuditEntry[]>("/admin/audit");
    if (result.ok) setAudit(result.data);
  }

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/");
      return;
    }
    setName(localStorage.getItem("name") ?? "");
    setRole(localStorage.getItem("role") ?? "");
    loadUsers();
    loadDepartments();
    loadRules();
    loadAttention();
    loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("name");
    router.replace("/");
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
      const result = await apiFetch<{ userId: number; department: string }>(
        `/admin/users/${user.userId}/department`,
        { method: "PUT", body: { department: nextDept } }
      );
      if (!result.ok) {
        setSavingId(null);
        setMessage(result.error);
        return;
      }
      done.push(`department → ${nextDept}`);
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

  return (
    <main className="min-h-screen p-10">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">
              Administrator Dashboard
            </h1>
            <p className="mt-2 text-ink-soft">
              Signed in as {name} · {role}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <TwoFactorToggle />
            <NotificationBell />
            <button
              onClick={handleLogout}
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Needs attention — requests the escalation worker has flagged for admin follow-up. */}
        {attention.length > 0 && (
          <div className="mt-8">
            <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-ink">
              Needs your attention
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Requests stuck at HR beyond the response window, or deferred too long.
            </p>
            <div className="mt-4 space-y-3">
              {attention.map((a) => (
                <div
                  key={a.requestId}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/requests/${a.requestId}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") router.push(`/requests/${a.requestId}`);
                  }}
                  className="block w-full cursor-pointer rounded-2xl border border-medium/50 bg-surface p-4 text-left transition hover:bg-canvas"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-medium text-ink">
                      Request #{a.requestId} · {a.requesterName}
                    </span>
                    <span className="shrink-0 rounded-full bg-medium px-2.5 py-0.5 text-xs font-semibold text-white">
                      {a.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">
                    {a.category} · KES {a.amount.toLocaleString()} · waiting since{" "}
                    {new Date(a.since).toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {a.officerName
                      ? `Responsible officer: ${a.officerName}${a.officerEmail ? ` (${a.officerEmail})` : ""}`
                      : "Unclaimed in the HR queue — no officer has taken it."}
                  </p>
                  {a.officerName && (
                    <div
                      className="mt-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => nudge(a.requestId)}
                        disabled={nudgingId === a.requestId}
                        className="rounded-lg border border-kq-red px-3 py-1.5 text-xs font-medium text-kq-red transition hover:bg-kq-red hover:text-white disabled:opacity-60"
                      >
                        {nudgingId === a.requestId ? "Sending…" : "Send reminder email"}
                      </button>
                      {nudgeMsg[a.requestId] && (
                        <span className="ml-2 text-xs text-ink-soft">
                          {nudgeMsg[a.requestId]}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-ink">
            Users &amp; roles
          </h2>
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="rounded-lg bg-kq-red px-4 py-2 text-sm font-medium text-white transition hover:bg-kq-red-deep"
          >
            {showCreate ? "Cancel" : "+ Create user"}
          </button>
        </div>

        {/* Create-user form */}
        {showCreate && (
          <div className="mt-4 rounded-2xl border border-line bg-surface p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={cEmail}
                  onChange={(e) => setCEmail(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  value={cPassword}
                  onChange={(e) => setCPassword(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                />
              </Field>
              <Field label="Role">
                <select
                  value={cRole}
                  onChange={(e) => setCRole(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Department">
                {/* D1: from the canonical list. A Department Supervisor's department decides
                    which tier-1 queue they see. */}
                <select
                  value={cDepartment}
                  onChange={(e) => setCDepartment(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                >
                  {departments.map((d) => (
                    <option key={d.departmentId} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={createUser}
                disabled={creating}
                className="rounded-lg bg-kq-red px-4 py-2 text-sm font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create user"}
              </button>
              {createMsg && <p className="text-sm text-ink">{createMsg}</p>}
            </div>
          </div>
        )}

        {loading && <p className="mt-6 text-ink-soft">Loading…</p>}
        {error && <p className="mt-6 text-sm text-kq-red">{error}</p>}
        {message && <p className="mt-6 text-sm text-ink">{message}</p>}

        {/* Users table */}
        {!loading && !error && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const selected = pendingRole[u.userId] ?? u.role;
                  const selectedDept = pendingDept[u.userId] ?? u.department;
                  const changed = selected !== u.role || selectedDept !== u.department;
                  return (
                    <tr key={u.userId} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-ink">{u.name}</td>
                      <td className="px-4 py-3 text-ink-soft">{u.email}</td>
                      <td className="px-4 py-3">
                        {/* D1: admin sets any user's department (users can only choose once). */}
                        <select
                          value={selectedDept}
                          onChange={(e) =>
                            setPendingDept((p) => ({ ...p, [u.userId]: e.target.value }))
                          }
                          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                        >
                          {departments.map((d) => (
                            <option key={d.departmentId} value={d.name}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={selected}
                          onChange={(e) =>
                            setPendingRole((p) => ({ ...p, [u.userId]: e.target.value }))
                          }
                          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => saveRole(u)}
                          disabled={!changed || savingId === u.userId}
                          className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-canvas disabled:opacity-40"
                        >
                          {savingId === u.userId ? "Saving…" : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* D1: departments — minimal management (list + create). */}
        <h2 className="mt-10 font-[family-name:var(--font-heading)] text-xl font-semibold text-ink">
          Departments
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          A Department Supervisor reviews only requests from their own department (tier 1);
          Welfare, Finance and HR see all departments. &quot;Unassigned&quot; holds accounts that
          haven&apos;t chosen yet — they must choose before submitting.
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Users</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.departmentId} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-ink">{d.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{d.userCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            value={newDept}
            onChange={(e) => setNewDept(e.target.value)}
            placeholder="New department name"
            maxLength={100}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
          />
          <button
            onClick={createDepartment}
            disabled={!newDept.trim()}
            className="rounded-lg bg-kq-red px-4 py-2 text-sm font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60"
          >
            + Add department
          </button>
          {deptMsg && <p className="text-sm text-ink">{deptMsg}</p>}
        </div>

        {/* Validation rules — read-only view of the current thresholds. */}
        {rules.length > 0 && (
          <>
            <h2 className="mt-10 font-[family-name:var(--font-heading)] text-xl font-semibold text-ink">
              Validation rules
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              The current rule thresholds applied to every submission. These are read-only;
              adjusting them at runtime is planned future work.
            </p>
            <div className="mt-4 space-y-3">
              {rules.map((r) => (
                <div
                  key={r.name}
                  className="rounded-2xl border border-line bg-surface p-4"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-medium text-ink">{r.name}</span>
                    <span className="shrink-0 font-semibold text-kq-red">{r.value}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{r.effect}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Recent activity — the unified audit trail across all requests. */}
        {audit.length > 0 && (
          <>
            <h2 className="mt-10 font-[family-name:var(--font-heading)] text-xl font-semibold text-ink">
              Recent activity
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              A chronological trail of significant actions across all requests.
            </p>
            <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-ink-soft">
                  <tr>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Request</th>
                    <th className="px-4 py-3 font-medium">Actor</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((e) => (
                    <tr key={e.logId} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                        {new Date(e.loggedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => router.push(`/requests/${e.requestId}`)}
                          className="text-kq-red hover:underline"
                        >
                          #{e.requestId}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {e.actorName ?? "System"}
                      </td>
                      <td className="px-4 py-3 text-ink">{e.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
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