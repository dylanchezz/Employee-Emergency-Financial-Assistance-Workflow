"use client";

// Phase 4 (B2) — the PUBLIC top nav for the landing page. Not the signed-in AppShell: just the name
// on the left and About / Login / Sign up on the right. If a session already exists in this browser
// (build decision 3), the auth links are replaced by "Go to dashboard" — a signed-in visitor isn't
// asked to log in again. Small screens: the links fold into a simple menu.

import Link from "next/link";
import { useState } from "react";
import { dashboardFor, LOGIN_PATH } from "../lib/auth";
import { useSession } from "../lib/session";
import ThemeToggle from "./ThemeToggle";   // Phase 7 (G2)

export default function PublicNav() {
  const { ready, token, role } = useSession();
  const [open, setOpen] = useState(false);
  const signedIn = ready && !!token;

  const links = (
    <>
      <a href="#about" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-ink transition hover:bg-canvas">
        About
      </a>
      {signedIn ? (
        <Link href={dashboardFor(role)} className="rounded-lg bg-kq-red px-4 py-2 font-medium text-white transition hover:bg-kq-red-deep">
          Go to dashboard
        </Link>
      ) : (
        <>
          <Link href={LOGIN_PATH} className="rounded-lg px-3 py-2 font-medium text-ink transition hover:bg-canvas">
            Login
          </Link>
          <Link href="/signup" className="rounded-lg bg-kq-red px-4 py-2 font-medium text-white transition hover:bg-kq-red-deep">
            Sign up
          </Link>
        </>
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8" aria-label="Public">
        <Link href="/" className="flex items-center gap-2.5">
          {/* A simple CSS mark — not a company logo. */}
          <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-kq-red text-sm font-bold text-white">
            EW
          </span>
          <span className="font-[family-name:var(--font-heading)] text-lg font-semibold tracking-tight text-ink">
            Employee Welfare Portal
          </span>
        </Link>

        <div className="hidden items-center gap-2 text-sm md:flex">
          <ThemeToggle />
          {links}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Menu"
            className="rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink"
          >
            ☰
          </button>
        </div>
      </nav>
      {open && <div className="flex flex-col gap-1 border-t border-line px-4 py-3 text-sm md:hidden">{links}</div>}
    </header>
  );
}
