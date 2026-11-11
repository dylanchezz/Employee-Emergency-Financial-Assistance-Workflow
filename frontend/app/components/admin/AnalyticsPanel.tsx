"use client";

// Phase 6 — the admin's analytics + downloads:
//  F3  "N users active now" — honestly labelled "used the app in the last 5 minutes" (throttled
//      users.last_seen_at), NOT live presence;
//  F4  users by role, expandable to departments; deactivated accounts counted separately (C2);
//  F5  one box per department with its requests by status (unblocked by D1's canonical departments);
//  F7  daily analytics CSV; F8 daily usage CSV ("users who took an action" — a proxy, labelled).
// Numbers + CSV only; charts are future work (the brief).

import { useEffect, useState } from "react";
import { apiFetch, downloadFile } from "../../lib/api";
import { statusStyle } from "../../lib/requestStatus";

type Active = { windowMinutes: number; definition: string; count: number;
  users: { userId: number; name: string; role: string; department: string; lastSeenAt: string }[] };
type UsersAnalytics = { totalActive: number; totalDeactivated: number;
  roles: { role: string; active: number; deactivated: number; departments: { department: string; active: number; deactivated: number }[] }[] };
type DeptRequests = { department: string; inReview: number; approved: number; disbursed: number;
  rejected: number; returned: number; deferred: number; total: number };

const DEPT_STATUSES: [keyof DeptRequests, string][] = [
  ["inReview", "In Review"], ["approved", "Approved"], ["disbursed", "Disbursed"],
  ["rejected", "Rejected"], ["returned", "Returned"], ["deferred", "Deferred"],
];

export default function AnalyticsPanel() {
  const [active, setActive] = useState<Active | null>(null);
  const [usersA, setUsersA] = useState<UsersAnalytics | null>(null);
  const [depts, setDepts] = useState<DeptRequests[]>([]);
  const [openRole, setOpenRole] = useState<Record<string, boolean>>({});
  const [days, setDays] = useState(30);
  const [dlMsg, setDlMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch<Active>("/admin/analytics/active-users"),
      apiFetch<UsersAnalytics>("/admin/analytics/users"),
      apiFetch<DeptRequests[]>("/admin/analytics/requests-by-department"),
    ]).then(([a, u, d]) => {
      if (a.ok) setActive(a.data);
      if (u.ok) setUsersA(u.data);
      if (d.ok) setDepts(d.data);
      const failed = [a, u, d].find((r) => !r.ok);
      if (failed && !failed.ok) setError(failed.error);
    });
  }, []);

  async function download(kind: "daily" | "usage") {
    setDlMsg("");
    const err = await downloadFile(`/admin/analytics/${kind}.csv?days=${days}`, `${kind}-last-${days}-days.csv`);
    setDlMsg(err ?? "");
  }

  return (
    <section className="mt-10">
      <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-ink">Analytics</h2>
      {error && <p className="mt-2 text-sm text-kq-red">Some analytics couldn&apos;t load: {error}</p>}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* F3 */}
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm text-ink-soft">Active now</p>
          <p className="mt-1 font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">
            {active?.count ?? "–"} <span className="text-base font-medium text-ink-soft">user{active?.count === 1 ? "" : "s"}</span>
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {active?.definition ?? "Signed-in users who used the app recently."} Not live presence.
          </p>
          {active && active.users.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {active.users.slice(0, 8).map((u) => (
                <li key={u.userId} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-ink">{u.name} <span className="text-ink-soft">· {u.role}</span></span>
                  <span className="shrink-0 text-xs text-ink-soft">{new Date(u.lastSeenAt).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* F4 */}
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm text-ink-soft">Users by role</p>
          <p className="mt-1 font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">
            {usersA?.totalActive ?? "–"} <span className="text-base font-medium text-ink-soft">active</span>
          </p>
          {usersA && usersA.totalDeactivated > 0 && (
            <p className="text-xs text-ink-soft">+ {usersA.totalDeactivated} deactivated (not counted above)</p>
          )}
          <ul className="mt-3 space-y-1 text-sm">
            {usersA?.roles.map((r) => (
              <li key={r.role}>
                <button onClick={() => setOpenRole((o) => ({ ...o, [r.role]: !o[r.role] }))} aria-expanded={!!openRole[r.role]}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1 text-left transition hover:bg-canvas">
                  <span className="text-ink">{openRole[r.role] ? "▾" : "▸"} {r.role}</span>
                  <span className="text-ink">
                    {r.active}{r.deactivated > 0 && <span className="text-xs text-ink-soft"> (+{r.deactivated} deactivated)</span>}
                  </span>
                </button>
                {openRole[r.role] && (
                  <ul className="mb-1 ml-6 mt-0.5 space-y-0.5 text-xs">
                    {r.departments.map((d) => (
                      <li key={d.department} className="flex justify-between gap-3 text-ink-soft">
                        <span>{d.department}</span>
                        <span>{d.active}{d.deactivated > 0 && ` (+${d.deactivated} deactivated)`}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* F5 */}
      <h3 className="mt-8 font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">Requests by department</h3>
      <p className="text-sm text-ink-soft">By the employee&apos;s current department.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {depts.map((d) => (
          <div key={d.department} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium text-ink">{d.department}</p>
              <p className="text-sm text-ink-soft">{d.total} total</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {DEPT_STATUSES.map(([key, label]) => (
                <span key={key} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle(label)} ${d[key] === 0 ? "opacity-40" : ""}`}>
                  {label} {d[key] as number}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* F7 + F8 */}
      <h3 className="mt-8 font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">Downloads (CSV)</h3>
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
        <label className="text-sm text-ink-soft">
          Period{" "}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="ml-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 365 days</option>
          </select>
        </label>
        <button onClick={() => download("daily")}
          className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-canvas">
          Daily analytics
        </button>
        <button onClick={() => download("usage")}
          className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-canvas">
          Daily usage
        </button>
        <p className="w-full text-xs text-ink-soft">
          Daily analytics: submitted, fully approved, rejected, returned, deferred, disbursed and deletion requests per day.
          Daily usage counts users who took an action (an audit-log proxy — browsing alone isn&apos;t recorded).
        </p>
        {dlMsg && <p className="w-full text-sm text-kq-red">{dlMsg}</p>}
      </div>
    </section>
  );
}
