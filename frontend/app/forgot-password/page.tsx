"use client";

// Phase 7 (A4) — request a password-reset link. The backend ALWAYS answers 200 with the same
// message, so this page shows that message whatever the email was: it never reveals whether an
// account exists (or whether it is a Google-only account, which has no password to reset).

import { useState } from "react";
import AuthCard, { authButtonClass, authInputClass } from "@/app/components/AuthCard";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sentMessage, setSentMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSentMessage(body?.message ?? "If an account exists for that email, we've sent a reset link.");
    } catch {
      setError("Cannot reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Forgot your password?" subtitle="Enter your email and we'll send you a link to choose a new one.">
      {sentMessage ? (
        <div className="mt-6 space-y-3">
          <p className="rounded-lg border border-low/30 bg-low/10 px-3.5 py-2.5 text-sm text-low" role="status">
            {sentMessage}
          </p>
          <p className="text-sm text-ink-soft">
            Signed up with Google? Use &ldquo;Continue with Google&rdquo; on the sign-in page instead &mdash; those
            accounts don&apos;t have a password here.
          </p>
          <button type="button" onClick={() => setSentMessage("")} className="text-sm text-kq-red hover:underline">
            Send to a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6">
          <label htmlFor="email" className="block text-sm font-medium text-ink">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
            placeholder="you@company.com"
          />
          {error && (
            <p className="mt-4 text-sm text-kq-red" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className={authButtonClass}>
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
