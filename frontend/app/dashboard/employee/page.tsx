"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function EmployeeDashboard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/");
      return;
    }
    setName(localStorage.getItem("name") ?? "");
    setRole(localStorage.getItem("role") ?? "");
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("name");
    router.replace("/");
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">
              Employee Dashboard
            </h1>
            <p className="mt-1 text-ink-soft">
              Signed in as {name} · {role}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-ink-soft hover:text-ink transition"
          >
            Sign out
          </button>
        </div>

        <div className="mt-8 flex items-center justify-between rounded-2xl border border-line bg-surface p-6">
          <div>
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-ink">
              Need assistance?
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Submit an emergency financial assistance request.
            </p>
          </div>
          <button
            onClick={() => router.push("/requests/new")}
            className="rounded-lg bg-kq-red px-5 py-2.5 font-medium text-white transition hover:bg-kq-red-deep"
          >
            + New request
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-surface p-8 text-ink-soft">
          Your requests will appear here. (Coming in a later feature.)
        </div>
      </div>
    </main>
  );
}