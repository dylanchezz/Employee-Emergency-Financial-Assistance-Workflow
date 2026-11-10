"use client";

// A2 Email 2FA — minimal opt-in/opt-out switch for the signed-in user. Deliberately small:
// it moves into the Profile screen (backlog C1) when that's built.

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export default function TwoFactorToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = still loading
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await apiFetch<{ enabled: boolean; available: boolean }>("/auth/2fa");
      if (res.ok) {
        setEnabled(res.data.enabled);
        // A3: Google-only accounts sign in via Google (its own MFA) — no email 2FA to offer.
        setAvailable(res.data.available);
      }
    })();
  }, []);

  async function toggle() {
    if (enabled === null) return;
    setError("");

    if (!enabled) {
      // Opting IN changes how you sign in, so confirm. Opting OUT is one step, no confirm.
      const ok = window.confirm(
        "Turn on two-step sign-in?\n\nEach time you sign in you'll also need a 6-digit code we email to you."
      );
      if (!ok) return;
    }

    setBusy(true);
    const res = await apiFetch<{ enabled: boolean }>(
      enabled ? "/auth/2fa/disable" : "/auth/2fa/enable",
      { method: "POST" }
    );
    setBusy(false);
    if (res.ok) {
      setEnabled(res.data.enabled);
    } else {
      setError(res.error);
    }
  }

  if (enabled === null || !available) return null;

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={toggle}
        disabled={busy}
        title={enabled ? "Two-step sign-in is on. Click to turn it off." : "Two-step sign-in is off. Click to turn it on."}
        className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-canvas disabled:opacity-60"
      >
        2-step sign-in: <span className={enabled ? "text-low" : "text-ink-soft"}>{enabled ? "On" : "Off"}</span>
      </button>
      {error && (
        <p className="mt-1 max-w-[16rem] text-right text-xs text-kq-red" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
