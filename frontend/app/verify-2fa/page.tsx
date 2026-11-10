"use client";

// A2 Email 2FA — step 2 of login. The password was already accepted; the backend emailed a
// 6-digit code and gave us a short-lived pre-auth token (kept in sessionStorage). That token
// is sent ONLY to /verify-2fa and /resend-2fa; the real app JWT arrives after a correct code.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearTwoFactorChallenge,
  completeLogin,
  loadTwoFactorChallenge,
  setLoginNotice,
  type AuthResponse,
  type TwoFactorChallenge,
} from "../lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

type ErrorBody = {
  error?: string;
  startOver?: boolean;
  expired?: boolean;
  retryAfterSeconds?: number;
  resendCooldownSeconds?: number;
  message?: string;
};

export default function VerifyTwoFactorPage() {
  const router = useRouter();
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // No pending challenge (direct visit, new tab, already used) → back to the password step.
  useEffect(() => {
    const pending = loadTwoFactorChallenge();
    if (!pending) {
      router.replace("/");
      return;
    }
    setChallenge(pending);
    setCooldown(pending.resendCooldownSeconds);
  }, [router]);

  // Tick the resend cooldown down once a second. (The server enforces it too — this is UX.)
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // A 401 means the pre-auth token is dead (expired, or the code was locked out/consumed):
  // only a fresh password login can help, so clear the challenge and go back with a reason.
  function startOver(message: string) {
    clearTwoFactorChallenge();
    setLoginNotice(message);
    router.replace("/");
  }

  async function post(path: string, body?: unknown) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${challenge!.preAuthToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => null)) as (ErrorBody & Partial<AuthResponse>) | null;
    return { res, data };
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const { res, data } = await post("/auth/verify-2fa", { code });
      if (res.ok && data) {
        router.push(completeLogin(data as AuthResponse));
        return;
      }
      if (res.status === 401) {
        startOver(data?.error ?? "Your sign-in step timed out. Please sign in again.");
        return;
      }
      // 400 wrong/malformed code, 410 expired code (press resend).
      setError(data?.error ?? "Something went wrong. Please try again.");
      setCode("");
    } catch {
      setError("Cannot reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!challenge || cooldown > 0) return;
    setError("");
    setInfo("");
    try {
      const { res, data } = await post("/auth/resend-2fa");
      if (res.ok) {
        setInfo(data?.message ?? "A new code has been sent.");
        setCooldown(data?.resendCooldownSeconds ?? challenge.resendCooldownSeconds);
        setCode("");
        return;
      }
      if (res.status === 401) {
        startOver(data?.error ?? "Your sign-in step timed out. Please sign in again.");
        return;
      }
      // 429 cooldown / resend cap, 503 email failure.
      setError(data?.error ?? "Could not send a new code.");
      if (data?.retryAfterSeconds) setCooldown(data.retryAfterSeconds);
    } catch {
      setError("Cannot reach the server. Is the backend running?");
    }
  }

  if (!challenge) return null;

  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-surface">
      <form onSubmit={handleVerify} className="w-full max-w-sm">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-ink">
          Check your email
        </h2>
        <p className="mt-1 text-ink-soft">
          We sent a 6-digit sign-in code to <span className="font-medium text-ink">{challenge.maskedEmail}</span>.
          It expires in 10 minutes.
        </p>

        <div className="mt-8">
          <label htmlFor="code" className="block text-sm font-medium text-ink">
            Sign-in code
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-center text-2xl tracking-[0.5em] text-ink outline-none transition focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
            placeholder="000000"
          />
        </div>

        {error && (
          <p className="mt-4 text-sm text-kq-red" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="mt-4 text-sm text-low" role="status">
            {info}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="mt-7 w-full rounded-lg bg-kq-red py-2.5 font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60"
        >
          {loading ? "Verifying…" : "Verify and sign in"}
        </button>

        <div className="mt-6 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0}
            className="font-medium text-kq-red hover:underline disabled:cursor-not-allowed disabled:text-ink-soft disabled:no-underline"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
          <button
            type="button"
            onClick={() => {
              clearTwoFactorChallenge();
              router.replace("/");
            }}
            className="text-ink-soft hover:underline"
          >
            Back to sign in
          </button>
        </div>
      </form>
    </main>
  );
}
