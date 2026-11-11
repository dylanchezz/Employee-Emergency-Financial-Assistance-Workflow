"use client";

// Phase 3 — C1 Profile screen (all roles). One account page hosting what used to be scattered
// across the three dashboards: the 2FA toggle (A2, moved here), change password (A6, new), the
// account-deletion request (C2, moved here), the D1 department step (if still "Unassigned") and the
// profile basics with an INITIALS avatar (build decision 2 — picture upload deferred).

import { useEffect, useState } from "react";
import { apiFetch } from "@/app/lib/api";
import Avatar from "@/app/components/Avatar";
import TwoFactorToggle from "@/app/components/TwoFactorToggle";
import AccountDeletionCard from "@/app/components/AccountDeletionCard";
import CompleteProfileCard from "@/app/components/CompleteProfileCard";

type Me = {
  userId: number;
  name: string;
  email: string;
  role: string;
  department: string;
  createdAt: string;
  hasPassword: boolean;
  signInMethod: string;   // "password" or the OAuth provider, e.g. "google"
  twoFactorEnabled: boolean;
};

// Stable no-op for CompleteProfileCard (it reports whether submitting is blocked; Profile doesn't need it).
const ignoreStatus = () => {};

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Me>("/me").then((res) => {
      if (res.ok) setMe(res.data);
      else setError(res.error);
    });
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">Profile</h1>
      {error && <p className="mt-4 text-sm text-kq-red">{error}</p>}

      {me && (
        <>
          {/* Basics */}
          <section className="mt-6 flex items-center gap-5 rounded-2xl border border-line bg-surface p-6">
            <Avatar name={me.name} size="lg" />
            <div className="min-w-0">
              <p className="font-[family-name:var(--font-heading)] text-xl font-semibold text-ink">{me.name}</p>
              <p className="break-all text-sm text-ink-soft">{me.email}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-kq-red/10 px-2.5 py-0.5 font-semibold text-kq-red">{me.role}</span>
                <span className="rounded-full bg-canvas px-2.5 py-0.5 text-ink">{me.department}</span>
                <span className="rounded-full bg-canvas px-2.5 py-0.5 text-ink">
                  {me.signInMethod === "password" ? "Password sign-in" : `Signs in with ${capitalise(me.signInMethod)}`}
                </span>
              </div>
            </div>
          </section>

          {/* D1/C7: only renders when the department is still "Unassigned". */}
          <CompleteProfileCard onStatus={ignoreStatus} />

          {/* Security */}
          <section className="mt-8 rounded-2xl border border-line bg-surface p-6">
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">Security</h2>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
              <div>
                <p className="font-medium text-ink">Two-step sign-in</p>
                <p className="text-sm text-ink-soft">
                  {me.hasPassword
                    ? "Also ask for a 6-digit code from your email when you sign in with your password."
                    : "Your account signs in with Google, which provides its own two-step verification."}
                </p>
              </div>
              {/* Hides itself for Google-only accounts (A27). */}
              <TwoFactorToggle />
            </div>

            {me.hasPassword ? (
              <ChangePasswordForm />
            ) : (
              <p className="mt-5 text-sm text-ink-soft">
                Password: not applicable — this account signs in with Google.
              </p>
            )}
          </section>

          {/* C2: account deletion (soft-delete, admin-approved). */}
          <AccountDeletionCard />
        </>
      )}
    </div>
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// A6 — change password. The server re-checks everything (current password, length, "different").
function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDone("");
    if (next.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    setBusy(true);
    const res = await apiFetch<{ changed: boolean; noticeEmailSent: boolean }>("/me/change-password", {
      method: "POST",
      body: { currentPassword: current, newPassword: next },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(
      "Password changed." +
        (res.data.noticeEmailSent ? " A security notice was sent to your email." : "") +
        " Other devices already signed in stay signed in until their session expires."
    );
  }

  const field =
    "mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-kq-red focus:ring-2 focus:ring-kq-red/20";

  return (
    <form onSubmit={submit} className="mt-5">
      <p className="font-medium text-ink">Change password</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm text-ink-soft">
          Current password
          <input type="password" autoComplete="current-password" required value={current}
            onChange={(e) => setCurrent(e.target.value)} className={field} />
        </label>
        <label className="text-sm text-ink-soft">
          New password
          <input type="password" autoComplete="new-password" required minLength={8} value={next}
            onChange={(e) => setNext(e.target.value)} className={field} />
        </label>
        <label className="text-sm text-ink-soft">
          Confirm new password
          <input type="password" autoComplete="new-password" required value={confirm}
            onChange={(e) => setConfirm(e.target.value)} className={field} />
        </label>
      </div>
      <button type="submit" disabled={busy}
        className="mt-4 rounded-lg bg-kq-red px-4 py-2 text-sm font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60">
        {busy ? "Changing…" : "Change password"}
      </button>
      {error && <p className="mt-3 text-sm text-kq-red" role="alert">{error}</p>}
      {done && <p className="mt-3 text-sm text-low-text" role="status">{done}</p>}
    </form>
  );
}
