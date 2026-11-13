"use client";

// Admin → Rules (was the "Rules" tab). Read-only view of the validation thresholds (A19);
// editing them at runtime is future work (G4).

import { useEffect, useState } from "react";
import { apiFetch } from "@/app/lib/api";
import type { ValidationRule } from "@/app/lib/admin";
import AdminOnly from "@/app/components/admin/AdminOnly";
import { PageHeader } from "@/app/components/ui/Ui";

export default function AdminRulesPage() {
  return (
    <AdminOnly>
      <RulesInner />
    </AdminOnly>
  );
}

function RulesInner() {
  const [rules, setRules] = useState<ValidationRule[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<ValidationRule[]>("/admin/rules").then((r) => {
      if (r.ok) setRules(r.data);
      else setError(r.error);
    });
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Validation rules"
        subtitle="The thresholds applied to every submission. Read-only — adjusting them at runtime is planned future work."
      />
      {error && <p className="mt-4 text-sm text-kq-red">{error}</p>}
      <div className="mt-6 grid gap-3 md:grid-cols-2">
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
    </div>
  );
}
