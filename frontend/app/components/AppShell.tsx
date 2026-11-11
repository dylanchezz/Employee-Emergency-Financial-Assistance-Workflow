"use client";

// Phase 3 (Part 0) — THE shared authenticated layout: a role-aware left sidebar + a top navbar
// (C7 time-based greeting, the NotificationBell, ONE Sign out wired to auth.ts signOut()).
// Mounted once by app/(app)/layout.tsx, so every signed-in page is content inside it — the three
// dashboards no longer each re-implement a header and logout (Impact Log A6).

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";   // Phase 7 (G2)
import Avatar from "./Avatar";
import { apiFetch } from "../lib/api";
import { signOut, LOGIN_PATH } from "../lib/auth";
import { isApproverRole, useSession } from "../lib/session";

type NavItem = { href: string; label: string; children?: { href: string; label: string }[] };

// Role-aware navigation. Employees AND approvers are requesters (A7/C8: approvers can submit and
// track their own requests); the admin is a read-only privileged viewer, so no request items.
function navFor(role: string | null): NavItem[] {
  const requester: NavItem[] = [
    { href: "/requests/new", label: "New request" },
    { href: "/track", label: "Track request" },
    {
      href: "/my-requests",
      label: "My requests",
      children: [
        { href: "/my-requests?view=accepted", label: "Accepted" },
        { href: "/my-requests?view=rejected", label: "Rejected" },
      ],
    },
  ];
  const account: NavItem[] = [
    { href: "/notifications", label: "Notifications" },
    { href: "/profile", label: "Profile" },
  ];

  if (role === "System Administrator") {
    return [{ href: "/dashboard/admin", label: "Admin dashboard" }, ...account];
  }
  if (isApproverRole(role)) {
    const review: NavItem[] = [{ href: "/dashboard/approver", label: "Review queue" }];
    if (role === "Finance Officer") {
      review.push({ href: "/dashboard/approver#disbursement", label: "Awaiting disbursement" });
    }
    return [...review, ...requester, ...account];
  }
  return [{ href: "/dashboard/employee", label: "Dashboard" }, ...requester, ...account];
}

// C7: greeting by the user's LOCAL time.
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, token, role, name } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [needsDepartment, setNeedsDepartment] = useState(false);

  // Not signed in → back to login. (No setState here — just navigation.)
  useEffect(() => {
    if (ready && !token) router.replace(LOGIN_PATH);
  }, [ready, token, router]);

  // C7: the complete-profile nudge for an "Unassigned" employee (D1), shown on every page except
  // Profile itself. Re-checked on navigation, so it disappears right after they choose.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    apiFetch<{ needsDepartment: boolean; canChoose: boolean }>("/me/department").then((res) => {
      if (alive && res.ok) setNeedsDepartment(res.data.needsDepartment && res.data.canChoose);
    });
    return () => {
      alive = false;
    };
  }, [token, pathname]);

  async function handleSignOut() {
    await signOut();
    router.replace(LOGIN_PATH);
  }

  if (!ready || !token) return null; // first paint / redirecting

  const items = navFor(role);

  return (
    <div className="flex min-h-screen w-full">
      {/* Sidebar — fixed column on md+, a slide-over on small screens. */}
      <aside
        className={`${menuOpen ? "flex" : "hidden"} fixed inset-y-0 left-0 z-30 w-64 flex-col border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-screen`}
      >
        <div className="bg-kq-red px-5 py-5 text-white">
          <span className="font-[family-name:var(--font-heading)] text-lg font-semibold tracking-tight">
            Employee Welfare Portal
          </span>
          <p className="mt-0.5 text-xs text-white/75">{role}</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
          <Suspense fallback={null}>
            <NavList items={items} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          </Suspense>
        </nav>
        <Link
          href="/profile"
          onClick={() => setMenuOpen(false)}
          className="flex items-center gap-3 border-t border-line px-5 py-4 transition hover:bg-canvas"
        >
          <Avatar name={name} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{name}</span>
            <span className="block text-xs text-ink-soft">View profile</span>
          </span>
        </Link>
      </aside>
      {menuOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Navbar */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              className="rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink md:hidden"
              aria-label="Open menu"
            >
              ☰
            </button>
            <p className="truncate text-ink">
              {greeting()}, <span className="font-semibold">{(name ?? "").split(" ")[0]}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NotificationBell />
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
            >
              Sign out
            </button>
          </div>
        </header>

        {needsDepartment && pathname !== "/profile" && (
          <div className="border-b border-medium/30 bg-medium/10 px-4 py-2.5 text-sm text-ink md:px-8" role="status">
            Complete your profile: choose your department before submitting a request.{" "}
            <Link href="/profile" className="font-medium text-kq-red hover:underline">
              Go to Profile →
            </Link>
          </div>
        )}

        <main className="w-full flex-1 px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}

// The nav links. Separate component because it reads the query string (?view=…) for the C3
// sub-items — useSearchParams needs a Suspense boundary in the App Router.
function NavList({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate: () => void }) {
  const search = useSearchParams();
  const view = search.get("view");

  // Exact matches only: an in-page anchor (#disbursement) never lights up on its own, and a request
  // detail page (/requests/56) doesn't light up "New request".
  const isActive = (href: string) => {
    if (href.includes("#")) return false;
    const [base, query] = href.split("?");
    if (query) return pathname === base && query === `view=${view}`;
    if (base === "/my-requests") return pathname === base && !view;
    return pathname === base;
  };

  const linkClass = (active: boolean, sub = false) =>
    `block rounded-lg ${sub ? "py-1.5 pl-8 pr-3 text-sm" : "px-3 py-2"} transition ${
      active ? "bg-kq-red/10 font-semibold text-kq-red" : "text-ink hover:bg-canvas"
    }`;

  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} onClick={onNavigate} className={linkClass(isActive(item.href))}>
            {item.label}
          </Link>
          {item.children && (
            <ul className="mt-1 space-y-0.5">
              {item.children.map((c) => (
                <li key={c.href}>
                  <Link href={c.href} onClick={onNavigate} className={linkClass(isActive(c.href), true)}>
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
