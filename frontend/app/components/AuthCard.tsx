import Link from "next/link";
import { LOGIN_PATH } from "@/app/lib/routes";

// Phase 7 (A4) — the simple centred card used by the "forgot password" and "reset password" pages.
// Same tokens as /login's form panel; the brand links home, "Back to sign in" links to /login.
export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-[family-name:var(--font-heading)] text-lg font-semibold text-kq-red hover:underline">
          Employee Welfare Portal
        </Link>
        <section className="mt-4 rounded-2xl border border-line bg-surface p-7 shadow-sm">
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          {children}
        </section>
        <Link href={LOGIN_PATH} className="mt-5 inline-block text-sm text-ink-soft transition hover:text-ink">
          ← Back to sign in
        </Link>
      </div>
    </main>
  );
}

export const authInputClass =
  "mt-1.5 w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-kq-red focus:ring-2 focus:ring-kq-red/20";

export const authButtonClass =
  "mt-6 w-full rounded-lg bg-kq-red py-2.5 font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60";
