"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NotificationBell from "../../components/NotificationBell";
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
  department: string | null;
  createdAt: string;
};

export default function AdminDashboard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  const [users, setUsers] = useState<AdminUser[]>([]);
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
  const [cDepartment, setCDepartment] = useState("");
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

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/");
      return;
    }
    setName(localStorage.getItem("name") ?? "");
    setRole(localStorage.getItem("role") ?? "");
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("name");
    router.replace("/");
  }

  async function saveRole(user: AdminUser) {
    const next = pendingRole[user.userId] ?? user.role;
    if (next === user.role) return; // nothing changed
    setMessage("");
    setSavingId(user.userId);
    const result = await apiFetch<{ userId: number; role: string }>(
      `/admin/users/${user.userId}/role`,
      { method: "PUT", body: { role: next } }
    );
    setSavingId(null);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMessage(`${user.name}'s role updated to ${next}.`);
    loadUsers();
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
        department: cDepartment.trim() || null,
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
    setCDepartment("");
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
            <NotificationBell />
            <button
              onClick={handleLogout}
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
            >
              Sign out
            </button>
          </div>
        </div>

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
              <Field label="Department (optional)">
                <input
                  value={cDepartment}
                  onChange={(e) => setCDepartment(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
                />
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
                  const changed = selected !== u.role;
                  return (
                    <tr key={u.userId} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 text-ink">{u.name}</td>
                      <td className="px-4 py-3 text-ink-soft">{u.email}</td>
                      <td className="px-4 py-3 text-ink-soft">{u.department ?? "—"}</td>
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