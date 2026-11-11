// Phase 8 (UI pass) — small shared building blocks so the dashboards, request page and admin page
// look like one product (skill: consistency, visual-hierarchy, empty-states). Tokens only.

import Link from "next/link";
import { TIER_ROLES } from "@/app/lib/requestStatus";

type IconType = (p: { size?: number; className?: string }) => React.ReactNode;

// Page title + one-line subtitle + optional actions on the right.
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// A number tile with an icon. Renders as a link, a button, or a plain card.
export function StatTile({
  label, value, icon: Icon, tone = "text-ink", iconTone = "bg-canvas text-ink-soft", href, onClick, hint,
}: {
  label: string; value: number | string; icon?: IconType; tone?: string; iconTone?: string;
  href?: string; onClick?: () => void; hint?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={`block font-[family-name:var(--font-heading)] text-3xl font-bold leading-none ${tone}`}>{value}</span>
        {Icon && (
          <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
            <Icon size={20} />
          </span>
        )}
      </div>
      <span className="mt-2 block text-sm font-medium text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-ink-soft">{hint}</span>}
    </>
  );
  const cls = "block rounded-2xl border border-line bg-surface p-4 text-left transition";
  if (href) return <Link href={href} className={`${cls} hover:border-kq-red/40 hover:shadow-sm`}>{body}</Link>;
  if (onClick) return <button onClick={onClick} className={`${cls} w-full hover:border-kq-red/40 hover:shadow-sm`}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

// Friendly empty state: icon, message, optional action.
export function EmptyState({ icon: Icon, title, body, action }: { icon?: IconType; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      {Icon && (
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-2xl bg-kq-red/10 text-kq-red">
          <Icon size={24} />
        </span>
      )}
      <p className="mt-3 font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Section heading inside a page: title + optional subtitle + optional right-side link/action.
export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">{title}</h2>
        {subtitle && <p className="text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// Where an in-review request is: four small segments (Supervisor → Welfare → Finance → HR).
// Text label alongside, so it never relies on colour alone.
export function TierProgress({ tier, compact = false }: { tier: number; compact?: boolean }) {
  const t = Math.min(Math.max(tier, 1), TIER_ROLES.length);
  const role = TIER_ROLES[t - 1].replace("Department ", "");
  return (
    <span className="inline-flex items-center gap-2" title={`Stage ${t} of ${TIER_ROLES.length}: ${role}`}>
      <span aria-hidden className="flex gap-1">
        {TIER_ROLES.map((_, i) => (
          <span key={i} className={`h-1.5 ${compact ? "w-3" : "w-5"} rounded-full ${i < t - 1 ? "bg-low" : i === t - 1 ? "bg-medium" : "bg-line"}`} />
        ))}
      </span>
      <span className="text-xs text-ink-soft">
        {compact ? `${t}/${TIER_ROLES.length}` : `Stage ${t} of ${TIER_ROLES.length} · ${role}`}
      </span>
    </span>
  );
}
