"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminDashboard() {
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
    <main className="min-h-screen p-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">
            Administrator Dashboard
          </h1>
          <p className="mt-2 text-ink-soft">
            Signed in as {name} · {role}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
        >
          Sign out
        </button>
      </div>
      <div className="mt-8 rounded-xl border border-line bg-surface p-8 text-ink-soft">
        User and rule management will appear here. (Coming in a later feature.)
      </div>
    </main>
  );
}