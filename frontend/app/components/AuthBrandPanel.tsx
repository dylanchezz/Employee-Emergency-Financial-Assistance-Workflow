// Phase 8 (UI pass) — ONE red brand panel for /login and /signup (they had two near-identical
// copies). Adds the EW mark, soft code-drawn arcs and three plain feature points. Decorative parts
// are aria-hidden; no images. Hidden on phones (the form is the whole screen there).

import Link from "next/link";
import { CheckCircleIcon } from "./icons";

const POINTS = [
  "Explainable priority — see why a request ranks where it does",
  "Four-tier human approval — the model never decides",
  "Every step tracked, notified and audited",
];

export default function AuthBrandPanel({ title, body }: { title: string; body: string }) {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-kq-red p-12 text-white md:flex">
      <div
        aria-hidden
        className="absolute inset-0 opacity-20"
        style={{ background: "radial-gradient(120% 90% at 100% 0%, var(--kq-red-deep) 0%, transparent 60%)" }}
      />
      {/* Soft arcs, bottom-right — same motif as the landing hero. */}
      <svg aria-hidden viewBox="0 0 400 400" className="pointer-events-none absolute -bottom-40 -right-40 h-[34rem] w-[34rem] text-white/15"
        fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="200" cy="200" r="190" />
        <circle cx="200" cy="200" r="150" strokeDasharray="4 8" />
        <circle cx="200" cy="200" r="110" />
        <circle cx="200" cy="200" r="70" strokeDasharray="2 6" />
      </svg>

      <div className="relative">
        {/* Phase 4: the brand links back to the public landing page. */}
        <Link href="/" className="inline-flex items-center gap-3 hover:opacity-90">
          <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-bold text-kq-red">EW</span>
          <span className="font-[family-name:var(--font-heading)] text-xl font-semibold tracking-tight">Employee Welfare Portal</span>
        </Link>
      </div>

      <div className="relative max-w-sm">
        <h1 className="font-[family-name:var(--font-heading)] text-4xl font-bold leading-tight">{title}</h1>
        <p className="mt-4 leading-relaxed text-white/90">{body}</p>
        <ul className="mt-8 space-y-3">
          {POINTS.map((p) => (
            <li key={p} className="flex items-start gap-3 text-sm text-white">
              <CheckCircleIcon size={20} className="mt-0.5 shrink-0" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative text-sm text-white/90">Internal system · Authorized users only</div>
    </aside>
  );
}
