"use client";

// Phase 7 (A4) — choose a new password from an emailed link: /reset-password?token=…
// The token is single-use and expires (AuthPolicy.ResetTokenLifetime); the backend checks both and
// answers one "invalid, used or expired" message for every bad link. On success we go to /login
// with a notice. The password rule (PasswordPolicy.MinLength = 8) is also checked by the backend.

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthCard, { authButtonClass, authInputClass } from "@/app/components/AuthCard";
import { LOGIN_PATH } from "@/app/lib/routes";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const MIN_LENGTH = 8;

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <AuthCard title="Reset your password">
        <p className="mt-6 text-sm text-kq-red" role="alert">
          This page needs the link from your reset email.
        </p>
        <Link href="/forgot-password" className="mt-4 inline-block text-sm font-medium text-kq-red hover:underline">
          Request a new reset link
        </Link>
      </AuthCard>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push(`${LOGIN_PATH}?reset=success`);
    } catch {
      setError("Cannot reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Choose a new password" subtitle={`At least ${MIN_LENGTH} characters.`}>
      <form onSubmit={handleSubmit} className="mt-6">
        <label htmlFor="password" className="block text-sm font-medium text-ink">
          New password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={authInputClass}
        />
        <label htmlFor="confirm" className="mt-5 block text-sm font-medium text-ink">
          Confirm new password
        </label>
        <input
          id="confirm"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={authInputClass}
        />
        {error && (
          <p className="mt-4 text-sm text-kq-red" role="alert">
            {error}{" "}
            {/invalid|expired|used/i.test(error) && (
              <Link href="/forgot-password" className="font-medium underline">
                Request a new link
              </Link>
            )}
          </p>
        )}
        <button type="submit" disabled={loading} className={authButtonClass}>
          {loading ? "Saving…" : "Set new password"}
        </button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
