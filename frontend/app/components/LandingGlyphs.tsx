// Phase 8 (Part E) — code-drawn landing visuals. No photos, no AI images: plain SVG/CSS in the
// existing tokens (currentColor / var(--line)), so they follow light and dark automatically.
// Everything here is decorative (aria-hidden) and can't take focus.

const stroke = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// One small glyph per "How it works" step, in the same order as STEPS on the landing page.
const STEP_PATHS: React.ReactNode[] = [
  // 1. Submit a request — a document with a plus
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M12 11v6M9 14h6" />
  </>,
  // 2. Automatic rule checks — a shield with a tick
  <>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
    <path d="M9 12l2 2 4-4" />
  </>,
  // 3. Explainable priority — bars of different heights
  <>
    <path d="M4 20h16" />
    <path d="M7 16v-4M12 16V7M17 16v-6" />
  </>,
  // 4. Four-tier human approval — four steps up
  <>
    <path d="M3 20h4v-4h4v-4h4V8h4V4" />
  </>,
  // 5. Finance disburses — a banknote
  <>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M7 10v4M17 10v4" />
  </>,
  // 6. Tracked and audited — a clipboard list
  <>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 3h6v3H9z" />
    <path d="M9 11h6M9 15h4" />
  </>,
];

export function StepGlyph({ index }: { index: number }) {
  return (
    <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-kq-red/10 text-kq-red">
      <svg {...stroke} width={20} height={20}>
        {STEP_PATHS[index] ?? STEP_PATHS[0]}
      </svg>
    </span>
  );
}

// A faint dot grid that fades out from behind the hero (tokens only: dots are var(--line)).
export function HeroDots() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: "radial-gradient(var(--line) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
        maskImage: "radial-gradient(ellipse 60% 70% at 72% 45%, #000 0%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse 60% 70% at 72% 45%, #000 0%, transparent 75%)",
      }}
    />
  );
}

// Soft concentric arcs behind the hero card, desktop only (the container clips them — no overflow).
export function HeroArcs() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 400"
      className="pointer-events-none absolute -right-28 top-1/2 hidden h-[30rem] w-[30rem] -translate-y-1/2 text-kq-red/15 md:block"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="200" cy="200" r="190" />
      <circle cx="200" cy="200" r="150" strokeDasharray="4 8" />
      <circle cx="200" cy="200" r="110" />
      <circle cx="200" cy="200" r="70" strokeDasharray="2 6" />
    </svg>
  );
}
