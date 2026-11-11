// Phase 4 (B1 + B3) — the PUBLIC landing page at "/" (the login form moved to /login).
// Same custom Tailwind tokens and type as the app (Impact Log A6 — no Bootstrap / stock template).
// Copy is placeholder the student will refine; it is deliberately honest: a capstone prototype,
// generic name, no real-company branding, no invented numbers, testimonials, screenshots or logos.

import Link from "next/link";
import PublicNav from "./components/PublicNav";
import { LOGIN_PATH } from "./lib/routes";
import { PRIORITY_STYLES } from "./lib/requestStatus";
import { HeroArcs, HeroDots, StepGlyph } from "./components/LandingGlyphs";   // Phase 8 (Part E)
import { CheckCircleIcon, RouteIcon, ShieldIcon, UserIcon, DashboardIcon } from "./components/icons";

const STEPS = [
  { title: "Submit a request", body: "An employee describes the emergency, the amount needed and attaches supporting documents." },
  { title: "Automatic rule checks", body: "Policy rules flag duplicates, the yearly limit and amounts out of line with salary — before anyone spends time on it." },
  { title: "Explainable priority", body: "A Random Forest model ranks urgency (High / Medium / Low) and shows, in plain language, the factors behind it." },
  { title: "Four-tier human approval", body: "Department Supervisor → Welfare Officer → Finance Officer → HR Manager. Each step is a person's decision." },
  { title: "Finance disburses", body: "Once HR approves, Finance records the payout, closing the request." },
  { title: "Tracked and audited", body: "The employee follows progress and gets notified at each stage; every action lands in an audit trail." },
];

// Phase 8 (UI pass): each point gets a drawn icon (same stroke style as the app).
const POINT_ICONS = [DashboardIcon, UserIcon, RouteIcon, ShieldIcon];

const POINTS = [
  { title: "Explainable", body: "Every priority comes with the factors that drove it, so reviewers can see why a request was ranked the way it was." },
  { title: "Human-in-the-loop", body: "The model only orders the queue. Approving, returning or rejecting a request is always an officer's decision." },
  { title: "Transparent", body: "Employees track where their request is and are notified when it moves — no chasing by email." },
  { title: "Secure", body: "Role-based access, separation of duties, optional email two-step sign-in and Google sign-in." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <PublicNav />

      <main>
        {/* Hero — Phase 8 (Part E): a faint dot grid + soft arcs behind it, clipped (no 390px overflow). */}
        <div className="relative overflow-hidden">
          <HeroDots />
          <HeroArcs />
          <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:px-8 md:py-24">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-kq-red">Emergency financial assistance</p>
              <h1 className="mt-3 font-[family-name:var(--font-heading)] text-4xl font-bold leading-tight text-ink md:text-5xl">
                Employee welfare, prioritized fairly.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
                A workflow system that helps corporate welfare teams triage and approve emergency financial assistance
                requests — with an explainable priority model and a full audit trail.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="rounded-lg bg-kq-red px-6 py-3 font-medium text-white shadow-sm transition hover:bg-kq-red-deep">
                  Sign up
                </Link>
                <Link href={LOGIN_PATH} className="rounded-lg border border-line bg-surface px-6 py-3 font-medium text-ink transition hover:bg-canvas">
                  Login
                </Link>
              </div>
              {/* Phase 8: three plain promises, with a tick each (text carries the meaning). */}
              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
                {["Human approval at every step", "Reasons shown for every priority", "Fully audited"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <CheckCircleIcon size={16} className="shrink-0 text-low-text" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Illustration: the workflow as a simple CSS pipeline (illustrative, not a screenshot). */}
            <div aria-hidden className="relative rounded-3xl border border-line bg-surface p-6 shadow-sm md:p-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">How a request moves</p>
              <ol className="mt-5 space-y-0">
                {["Request submitted", "Rule checks", "Priority + the “why”", "4-tier approval", "Disbursed"].map((label, i, all) => (
                  <li key={label} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                        i === all.length - 1 ? "bg-low text-on-low" : i === 2 ? "bg-kq-red text-white" : "bg-kq-red/10 text-kq-red"
                      }`}>
                        {i + 1}
                      </span>
                      {i < all.length - 1 && <span className="my-1 h-6 w-px bg-line" />}
                    </div>
                    <span className="pt-1 font-medium text-ink">{label}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 flex flex-wrap gap-2 text-xs">
                {/* Phase 8: the same badge colours as the app (one definition in lib/requestStatus.ts). */}
                {(["High", "Medium", "Low"] as const).map((p) => (
                  <span key={p} className={`rounded-full px-2.5 py-1 font-semibold ${PRIORITY_STYLES[p]}`}>{p}</span>
                ))}
                <span className="self-center text-ink-soft">— urgency ranks the review queue</span>
              </div>
            </div>
          </section>
        </div>

        {/* How it works */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
            <h2 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">How it works</h2>
            <p className="mt-2 max-w-2xl text-ink-soft">One loop, from an employee&apos;s request to the payout.</p>
            <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-line bg-canvas p-6">
                  <div className="flex items-center gap-3">
                    <StepGlyph index={i} />
                    <span className="font-[family-name:var(--font-heading)] text-sm font-semibold text-kq-red">
                      Step {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-1 text-lg font-semibold text-ink">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Why it's different */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:px-8">
          <h2 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">Why it&apos;s different</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {POINTS.map((p, i) => {
              const Icon = POINT_ICONS[i];
              return (
              <div key={p.title} className="flex gap-4 rounded-2xl border border-line bg-surface p-6 transition hover:border-kq-red/40 hover:shadow-sm">
                <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-kq-red/10 text-kq-red">
                  <Icon size={22} />
                </span>
                <div>
                <h3 className="text-lg font-semibold text-ink">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{p.body}</p>
                </div>
              </div>
              );
            })}
          </div>
        </section>

        {/* Phase 8: a closing call to action before About. */}
        <section className="mx-auto max-w-6xl px-4 pb-16 md:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-kq-red px-6 py-10 text-white md:px-12">
            <svg aria-hidden viewBox="0 0 400 400" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 text-white/15"
              fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="200" cy="200" r="190" /><circle cx="200" cy="200" r="140" strokeDasharray="4 8" /><circle cx="200" cy="200" r="90" />
            </svg>
            <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold md:text-3xl">Need assistance, or reviewing requests?</h2>
                <p className="mt-2 max-w-xl text-white/90">Create an account to submit and track a request, or sign in to your review queue.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/signup" className="rounded-lg bg-white px-6 py-3 font-medium text-kq-red transition hover:bg-white/90">Sign up</Link>
                <Link href={LOGIN_PATH} className="rounded-lg border border-white/60 px-6 py-3 font-medium text-white transition hover:bg-white/10">Login</Link>
              </div>
            </div>
          </div>
        </section>

        {/* About — the nav's "About" link scrolls here (build decision 2: an in-page anchor). */}
        <section id="about" className="scroll-mt-20 bg-night text-white">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center md:px-8">
            <h2 className="font-[family-name:var(--font-heading)] text-3xl font-bold">About</h2>
            <p className="mt-5 text-lg leading-relaxed text-white/90">
              The Employee Welfare Portal is a final-year Computer Science capstone project at Strathmore University. It
              explores how an explainable Random Forest model can support — not replace — the people who review employee
              emergency welfare requests: ranking urgency transparently, keeping every decision with a human approver,
              and recording each step for accountability. It is a working prototype, not a commercial product.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm md:px-8">
          <span className="font-[family-name:var(--font-heading)] font-semibold text-ink">Employee Welfare Portal</span>
          <div className="flex gap-4">
            <Link href={LOGIN_PATH} className="text-ink-soft hover:text-ink">Login</Link>
            <Link href="/signup" className="text-ink-soft hover:text-ink">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
