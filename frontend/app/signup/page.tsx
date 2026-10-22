"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          // Send department only if the user typed one; otherwise omit it.
          department: department.trim() === "" ? null : department,
        }),
      });

      if (res.status === 409) {
        setError("An account with this email already exists.");
        return;
      }
      if (res.status === 400) {
        setError("Please fill in your name, email, and password.");
        return;
      }
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }

      // Success: send them to the login page with a hint to sign in.
      router.push("/?signup=success");
    } catch {
      setError("Cannot reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid md:grid-cols-2">
      {/* Brand panel — mirrors the login page. */}
      <aside className="relative hidden md:flex flex-col justify-between bg-kq-red text-white p-12 overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(120% 90% at 100% 0%, var(--kq-red-deep) 0%, transparent 60%)",
          }}
        />
        <div className="relative">
          <span className="font-[family-name:var(--font-heading)] text-xl font-semibold tracking-tight">
            Welfare Assistance
          </span>
        </div>
        <div className="relative max-w-sm">
          <h1 className="font-[family-name:var(--font-heading)] text-4xl font-bold leading-tight">
            Create your account.
          </h1>
          <p className="mt-4 text-white/80 leading-relaxed">
            Register to submit and track emergency financial assistance
            requests.
          </p>
        </div>
        <div className="relative text-sm text-white/60">
          Internal system · Authorized users only
        </div>
      </aside>

      {/* Form panel. */}
      <section className="flex items-center justify-center p-8 bg-surface">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <h2 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-ink">
            Sign up
          </h2>
          <p className="mt-1 text-ink-soft">Create an employee account.</p>

          <div className="mt-8">
            <label htmlFor="name" className="block text-sm font-medium text-ink">
              Full name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
              placeholder="Jane Doe"
            />
          </div>

          <div className="mt-5">
            <label htmlFor="email" className="block text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
              placeholder="you@company.com"
            />
          </div>

          <div className="mt-5">
            <label htmlFor="password" className="block text-sm font-medium text-ink">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
              placeholder="••••••••"
            />
          </div>

          <div className="mt-5">
            <label htmlFor="department" className="block text-sm font-medium text-ink">
              Department <span className="text-ink-soft">(optional)</span>
            </label>
            <input
              id="department"
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-kq-red focus:ring-2 focus:ring-kq-red/20"
              placeholder="Finance"
            />
          </div>

          {error && (
            <p className="mt-4 text-sm text-kq-red" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-7 w-full rounded-lg bg-kq-red py-2.5 font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>

          <p className="mt-6 text-sm text-ink-soft">
            Already have an account?{" "}
            <Link href="/" className="font-medium text-kq-red hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}