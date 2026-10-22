"use client";

import { useState, useEffect, Suspense  } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

// Map each role to its dashboard route.
const ROLE_ROUTES: Record<string, string> = {
  "Employee": "/dashboard/employee",
  "Department Supervisor": "/dashboard/approver",
  "Welfare Officer": "/dashboard/approver",
  "Finance Officer": "/dashboard/approver",
  "HR Manager": "/dashboard/approver",
  "System Administrator": "/dashboard/admin",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (searchParams.get("signup") === "success") {
      setNotice("Account created. Please sign in.");
    }
  }, [searchParams]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.status === 401) {
        setError("Incorrect email or password.");
        return;
      }
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }

      const data = await res.json();
      // Store the token and role for later authenticated requests.
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("name", data.name);

      const destination = ROLE_ROUTES[data.role] ?? "/dashboard/employee";
      router.push(destination);
    } catch {
      setError("Cannot reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid md:grid-cols-2">
      {/* Brand panel — the one bold red moment. */}
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
            Support when it matters most.
          </h1>
          <p className="mt-4 text-white/80 leading-relaxed">
            A faster, fairer way to review employee emergency financial
            assistance, so that urgent needs are seen first.
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
            Welcome back
          </h2>
          <p className="mt-1 text-ink-soft">Sign in to continue.</p>
          {notice && (
            <p
              className="mt-4 rounded-lg border border-low/30 bg-low/10 px-3.5 py-2.5 text-sm text-low"
              role="status"
            >
              {notice}
            </p>
          )}

          <div className="mt-8">
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
            {loading ? "Signing in…" : "Sign in"}
          </button>
                    <p className="mt-6 text-sm text-ink-soft">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-kq-red hover:underline">
              Create one
            </Link>
          </p>
          
        </form>
      </section>
    </main>
  );
}
  export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}