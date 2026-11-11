"use client";

// Phase 7 (G2) — a light/dark switch for the signed-in navbar (AppShell) and the public nav.
// useSyncExternalStore (like lib/session.ts) reads the live theme without a setState-in-effect;
// the server snapshot is null, so nothing theme-specific renders until the browser knows.

import { useSyncExternalStore } from "react";
import { currentTheme, setTheme, subscribeTheme, type Theme } from "../lib/theme";

export default function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribeTheme, currentTheme, () => null);
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-soft transition hover:bg-canvas hover:text-ink"
    >
      {theme === null ? null : theme === "dark" ? (
        // Sun — shown in dark mode (click for light).
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // Moon — shown in light mode (click for dark).
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
