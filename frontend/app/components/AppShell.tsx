"use client";

// Phase 3 (Part 0) — THE shared authenticated layout: a role-aware left sidebar + a top navbar
// (C7 time-based greeting, the NotificationBell, ONE Sign out wired to auth.ts signOut()).
// Mounted once by app/(app)/layout.tsx, so every signed-in page is content inside it — the three
// dashboards no longer each re-implement a header and logout (Impact Log A6).
//
// Phase 8 (UI pass) — responsive shell:
//   < 768px   the sidebar is a slide-in drawer (close button, Esc, scrim; closes on navigation)
//   768–1023  an icon rail (labels kept for screen readers, shown as tooltips)
//   ≥ 1024    the full sidebar, with a collapse-to-rail toggle remembered in this browser
// Navigation is grouped into sections and every item has an icon (skill: nav-label-icon,
// nav-state-active, adaptive-navigation). The navbar is taller, with the greeting + today's date.

import Link from "next/link";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";   // Phase 7 (G2)
import {
  BanknoteIcon, CheckCircleIcon, ChevronsLeftIcon, CloseIcon, DashboardIcon, FolderIcon, InboxIcon,
  LogOutIcon, MenuIcon, PlusIcon, RouteIcon, ShieldIcon, UserIcon, BellIcon, XCircleIcon,
  UsersIcon, BuildingIcon, UserMinusIcon, RulesIcon, ActivityIcon,
} from "./icons";
import Avatar from "./Avatar";
import { apiFetch } from "../lib/api";
import { signOut, LOGIN_PATH } from "../lib/auth";
import { isApproverRole, useSession } from "../lib/session";
import { formatLongDate } from "@/app/lib/format";

type Icon = (p: { size?: number; className?: string }) => React.ReactNode;
type NavItem = { href: string; label: string; icon: Icon; children?: { href: string; label: string; icon: Icon }[] };
type NavSection = { title: string; items: NavItem[] };

// Role-aware navigation. Employees AND approvers are requesters (A7/C8: approvers can submit and
// track their own requests); the admin is a read-only privileged viewer, so no request items.
function navFor(role: string | null): NavSection[] {
  const requests: NavItem[] = [
    { href: "/requests/new", label: "New request", icon: PlusIcon },
    { href: "/track", label: "Track request", icon: RouteIcon },
    {
      href: "/my-requests",
      label: "My requests",
      icon: FolderIcon,
      children: [
        { href: "/my-requests?view=accepted", label: "Accepted", icon: CheckCircleIcon },
        { href: "/my-requests?view=rejected", label: "Rejected", icon: XCircleIcon },
      ],
    },
  ];
  const account: NavSection = {
    title: "Account",
    items: [
      { href: "/notifications", label: "Notifications", icon: BellIcon },
      { href: "/profile", label: "Profile", icon: UserIcon },
    ],
  };

  if (role === "System Administrator") {
    // Phase 8 follow-up: each admin section is its own page (was a tab on the dashboard).
    return [
      { title: "Administration", items: [{ href: "/dashboard/admin", label: "Dashboard", icon: ShieldIcon }] },
      {
        title: "Manage",
        items: [
          { href: "/admin/users", label: "Users", icon: UsersIcon },
          { href: "/admin/departments", label: "Departments", icon: BuildingIcon },
          { href: "/admin/account-requests", label: "Account requests", icon: UserMinusIcon },
          { href: "/admin/rules", label: "Rules", icon: RulesIcon },
          { href: "/admin/activity", label: "Activity", icon: ActivityIcon },
        ],
      },
      account,
    ];
  }
  if (isApproverRole(role)) {
    const review: NavItem[] = [{ href: "/dashboard/approver", label: "Review queue", icon: InboxIcon }];
    if (role === "Finance Officer") {
      review.push({ href: "/dashboard/approver#disbursement", label: "Awaiting disbursement", icon: BanknoteIcon });
    }
    return [{ title: "Review", items: review }, { title: "My requests", items: requests }, account];
  }
  return [
    { title: "Overview", items: [{ href: "/dashboard/employee", label: "Dashboard", icon: DashboardIcon }] },
    { title: "Requests", items: requests },
    account,
  ];
}

// C7: greeting by the user's LOCAL time.
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// The desktop "collapse to rail" choice, remembered per browser. useSyncExternalStore (like
// lib/session.ts / lib/theme.ts) — no setState-in-effect, and storage errors are harmless.
const SIDEBAR_KEY = "sidebar";
const SIDEBAR_EVENT = "sidebarchange";
function readCollapsed(): boolean {
  try { return localStorage.getItem(SIDEBAR_KEY) === "collapsed"; } catch { return false; }
}
function subscribeCollapsed(cb: () => void) {
  window.addEventListener(SIDEBAR_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(SIDEBAR_EVENT, cb); window.removeEventListener("storage", cb); };
}
function setCollapsed(value: boolean) {
  try { localStorage.setItem(SIDEBAR_KEY, value ? "collapsed" : "expanded"); } catch { /* not saved */ }
  window.dispatchEvent(new Event(SIDEBAR_EVENT));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, token, role, name } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [needsDepartment, setNeedsDepartment] = useState(false);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);

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

  // Phase 8: while the mobile drawer is open — Esc closes it, and the page behind doesn't scroll.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  async function handleSignOut() {
    await signOut();
    router.replace(LOGIN_PATH);
  }

  if (!ready || !token) return null; // first paint / redirecting

  const sections = navFor(role);
  // Labels: always visible in the mobile drawer; hidden (but still read by screen readers) on the
  // tablet rail; visible again on desktop unless the user collapsed the sidebar.
  const labelClass = collapsed ? "md:sr-only" : "md:sr-only lg:not-sr-only";
  const railAlign = collapsed ? "md:justify-center md:px-0" : "md:justify-center md:px-0 lg:justify-start lg:px-3";
  const hideOnRail = collapsed ? "md:hidden" : "md:hidden lg:block";

  return (
    <div className="flex min-h-screen w-full">
      {/* Sidebar */}
      <aside
        id="app-sidebar"
        aria-label="Sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface shadow-xl transition-[transform,visibility] duration-200 ease-out md:visible md:sticky md:top-0 md:z-0 md:h-screen md:max-w-none md:translate-x-0 md:shadow-none md:transition-[width] ${
          // closed on a phone: off-screen AND invisible, so its links can't be reached with Tab
          menuOpen ? "visible translate-x-0" : "invisible -translate-x-full"
        } ${collapsed ? "md:w-[4.75rem]" : "md:w-[4.75rem] lg:w-64"}`}
      >
        {/* Brand — same height as the navbar so their bottom borders line up. */}
        <div className={`flex h-16 shrink-0 items-center gap-3 border-b border-line px-4 ${collapsed ? "md:justify-center" : "md:justify-center lg:justify-start"}`}>
          <Link href="/" className="flex min-w-0 items-center gap-3" title="Employee Welfare Portal">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-kq-red text-sm font-bold text-white">
              EW
            </span>
            <span className={`min-w-0 ${labelClass}`}>
              <span className="block truncate font-[family-name:var(--font-heading)] text-[15px] font-semibold leading-tight text-ink">
                Employee Welfare Portal
              </span>
              <span className="block truncate text-xs text-ink-soft">{role}</span>
            </span>
          </Link>
          <button
            onClick={() => setMenuOpen(false)}
            className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-soft transition hover:bg-canvas hover:text-ink md:hidden"
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
          <Suspense fallback={null}>
            <NavList
              sections={sections}
              pathname={pathname}
              onNavigate={() => setMenuOpen(false)}
              labelClass={labelClass}
              railAlign={railAlign}
              hideOnRail={hideOnRail}
            />
          </Suspense>
        </nav>

        {/* Desktop-only: collapse / expand the sidebar. */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`mx-3 mb-2 hidden h-10 items-center gap-3 rounded-lg px-3 text-sm text-ink-soft transition hover:bg-canvas hover:text-ink lg:flex ${collapsed ? "justify-center px-0" : ""}`}
        >
          <ChevronsLeftIcon className={`shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          <span className={collapsed ? "sr-only" : ""}>Collapse</span>
        </button>

        <Link
          href="/profile"
          onClick={() => setMenuOpen(false)}
          title={name ?? "Profile"}
          className={`flex items-center gap-3 border-t border-line px-4 py-3 transition hover:bg-canvas ${collapsed ? "md:justify-center" : "md:justify-center lg:justify-start"}`}
        >
          <Avatar name={name} size="sm" />
          <span className={`min-w-0 ${labelClass}`}>
            <span className="block truncate text-sm font-medium text-ink">{name}</span>
            <span className="block text-xs text-ink-soft">View profile</span>
          </span>
        </Link>
      </aside>

      {/* Mobile scrim behind the drawer. */}
      <button
        aria-label="Close menu"
        tabIndex={menuOpen ? 0 : -1}
        onClick={() => setMenuOpen(false)}
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity duration-200 md:hidden ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Navbar — 64px tall (was ~56), bigger greeting + today's date. */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-ink transition hover:bg-canvas md:hidden"
              aria-label="Open menu"
              aria-controls="app-sidebar"
              aria-expanded={menuOpen}
            >
              <MenuIcon />
            </button>
            <div className="min-w-0">
              <p className="truncate font-[family-name:var(--font-heading)] text-base font-semibold leading-tight text-ink md:text-lg">
                {greeting()}, {(name ?? "").split(" ")[0]}
              </p>
              <p className="hidden truncate text-xs text-ink-soft sm:block">{formatLongDate(new Date())}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            <ThemeToggle />
            <NotificationBell />
            <span aria-hidden className="mx-1 hidden h-8 w-px bg-line sm:block" />
            <button
              onClick={handleSignOut}
              aria-label="Sign out"
              className="flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-line px-3 text-sm font-medium text-ink transition hover:border-kq-red/40 hover:bg-canvas"
            >
              <LogOutIcon size={18} />
              <span className="hidden sm:inline">Sign out</span>
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

        <main className="w-full flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

// The nav links. Separate component because it reads the query string (?view=…) for the C3
// sub-items — useSearchParams needs a Suspense boundary in the App Router.
function NavList({
  sections, pathname, onNavigate, labelClass, railAlign, hideOnRail,
}: {
  sections: NavSection[]; pathname: string; onNavigate: () => void;
  labelClass: string; railAlign: string; hideOnRail: string;
}) {
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

  const linkClass = (active: boolean) =>
    `relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition ${railAlign} ${
      active ? "bg-kq-red/10 font-semibold text-kq-red" : "text-ink hover:bg-canvas"
    }`;

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <div key={section.title}>
          <p className={`mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-soft ${hideOnRail}`}>
            {section.title}
          </p>
          <ul className="space-y-1">
            {section.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link href={item.href} onClick={onNavigate} title={item.label}
                    aria-current={active ? "page" : undefined} className={linkClass(active)}>
                    {active && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-kq-red" />}
                    <Icon className="shrink-0" />
                    <span className={`truncate ${labelClass}`}>{item.label}</span>
                  </Link>
                  {item.children && (
                    <ul className={`mt-1 space-y-0.5 ${hideOnRail}`}>
                      {item.children.map((c) => {
                        const cActive = isActive(c.href);
                        const CIcon = c.icon;
                        return (
                          <li key={c.href}>
                            <Link href={c.href} onClick={onNavigate} aria-current={cActive ? "page" : undefined}
                              className={`flex h-9 items-center gap-2.5 rounded-lg pl-9 pr-3 text-sm transition ${
                                cActive ? "bg-kq-red/10 font-semibold text-kq-red" : "text-ink-soft hover:bg-canvas hover:text-ink"
                              }`}>
                              <CIcon size={16} className="shrink-0" />
                              {c.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
