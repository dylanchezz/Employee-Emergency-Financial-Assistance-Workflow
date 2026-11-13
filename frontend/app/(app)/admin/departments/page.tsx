"use client";

// Admin → Departments (was the "Departments" tab of the admin dashboard; now its own page).
// D1: list (with user counts) + create. The list drives tier-1 routing.

import { useEffect, useState } from "react";
import { apiFetch } from "@/app/lib/api";
import type { DepartmentRow } from "@/app/lib/admin";
import AdminOnly from "@/app/components/admin/AdminOnly";
import { PageHeader } from "@/app/components/ui/Ui";

export default function AdminDepartmentsPage() {
  return (
    <AdminOnly>
      <DepartmentsInner />
    </AdminOnly>
  );
}

function DepartmentsInner() {
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [error, setError] = useState("");
  const [newDept, setNewDept] = useState("");
  const [deptMsg, setDeptMsg] = useState("");

  const fetchDepartments = () => apiFetch<DepartmentRow[]>("/admin/departments");
  const apply = (r: Awaited<ReturnType<typeof fetchDepartments>>) => {
    if (r.ok) setDepartments(r.data);
    else setError(r.error);
  };

  useEffect(() => {
    fetchDepartments().then(apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createDepartment() {
    setDeptMsg("");
    const deptName = newDept.trim();
    if (!deptName) return;
    const result = await apiFetch<DepartmentRow>("/admin/departments", { method: "POST", body: { name: deptName } });
    if (!result.ok) { setDeptMsg(result.error); return; }
    setDeptMsg(`Department "${result.data.name}" created.`);
    setNewDept("");
    fetchDepartments().then(apply);
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Departments"
        subtitle="A Department Supervisor reviews only requests from their own department (tier 1); Welfare, Finance and HR see all departments."
      />

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
        <input
          value={newDept}
          onChange={(e) => setNewDept(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") createDepartment(); }}
          placeholder="New department name"
          aria-label="New department name"
          maxLength={100}
          className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20 sm:max-w-sm"
        />
        <button onClick={createDepartment} disabled={!newDept.trim()}
          className="h-10 rounded-lg bg-kq-red px-4 text-sm font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60">
          + Add department
        </button>
        {deptMsg && <p className="text-sm text-ink" role="status">{deptMsg}</p>}
      </div>

      {error && <p className="mt-4 text-sm text-kq-red">{error}</p>}

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
      <p className="mt-4 text-sm text-ink-soft">
        &quot;Unassigned&quot; holds accounts that haven&apos;t chosen a department yet — they must choose one before submitting a request.
      </p>
    </div>
  );
}
