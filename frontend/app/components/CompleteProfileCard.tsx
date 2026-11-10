"use client";

// D1 — the "complete your profile" step (completes A3/A27's deferred department step and
// backlog C7's nudge). Shown only while the signed-in user's department is "Unassigned" —
// e.g. a Google sign-up, or an older account the migration backfilled. Tier-1 routing needs a
// real department, so the backend refuses submissions until one is chosen; this card is the
// friendly front of that rule. Self-service is one-time; later changes are an admin action.

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

type MyDepartment = { department: string; needsDepartment: boolean; canChoose: boolean };

export default function CompleteProfileCard({
  onStatus,
}: {
  // Tells the parent whether submitting is currently blocked.
  onStatus: (needsDepartment: boolean) => void;
}) {
  const [status, setStatus] = useState<MyDepartment | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [choice, setChoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await apiFetch<MyDepartment>("/me/department");
      if (!res.ok) return;
      setStatus(res.data);
      onStatus(res.data.needsDepartment);
      if (res.data.canChoose) {
        const list = await fetch(`${API_BASE}/departments`).then((r) => (r.ok ? r.json() : []));
        setDepartments(list);
      }
    })();
  }, [onStatus]);

  async function save() {
    if (!choice) return;
    setSaving(true);
    setError("");
    const res = await apiFetch<MyDepartment>("/me/department", {
      method: "PUT",
      body: { department: choice },
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStatus(res.data);
    onStatus(false);
  }

  if (!status?.needsDepartment) return null;

  return (
    <div className="mt-8 rounded-2xl border border-medium/30 bg-medium/10 p-6" role="status">
      <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
        Complete your profile
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Choose your department before submitting a request — it decides which Department
        Supervisor reviews your requests first. You can set this once; after that, an
        administrator can change it.
      </p>

      {status.canChoose ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="min-w-[14rem] rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
          >
            <option value="" disabled>
              {departments.length ? "Choose your department" : "Loading departments…"}
            </option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button
            onClick={save}
            disabled={!choice || saving}
            className="rounded-lg bg-kq-red px-5 py-2.5 font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save department"}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink">Please ask an administrator to set your department.</p>
      )}

      {error && (
        <p className="mt-3 text-sm text-kq-red" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
