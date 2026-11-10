// Shared sign-out logic — Phase 3 wired it into the ONE navbar "Sign out" (AppShell), replacing
// the three dashboards' inline handleLogout copies (the moment Impact Log A6 anticipated).
// JWTs are stateless — the server keeps no session — so signing out means the

import { notifySessionChanged } from "./session";
// client discards its token. We still notify the backend's /auth/logout endpoint
// as the formal action, but we don't block on it: even if that call fails, the
// token is cleared locally and the user is returned to the login page.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function signOut() {
  const token = localStorage.getItem("token");

  // Best-effort notify the backend; ignore any failure.
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    // Network error is fine — we clear the token regardless.
  }

  // The real logout: remove what identifies the user in this browser.
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("name");
  clearTwoFactorChallenge();
  notifySessionChanged();
}

// ---- Login completion (shared by the password login page and the A2 /verify-2fa page) ----
// One copy of "where does each role land" + "what a signed-in browser stores", so the
// one-step and two-step login paths can't drift apart.

const ROLE_ROUTES: Record<string, string> = {
  "Employee": "/dashboard/employee",
  "Department Supervisor": "/dashboard/approver",
  "Welfare Officer": "/dashboard/approver",
  "Finance Officer": "/dashboard/approver",
  "HR Manager": "/dashboard/approver",
  "System Administrator": "/dashboard/admin",
};

export type AuthResponse = {
  userId: number;
  name: string;
  email: string;
  role: string;
  token: string;
};

// Store the REAL app JWT (never the 2FA pre-auth token) and return the dashboard route.
export function completeLogin(data: AuthResponse): string {
  localStorage.setItem("token", data.token);
  localStorage.setItem("role", data.role);
  localStorage.setItem("name", data.name);
  clearTwoFactorChallenge();
  notifySessionChanged();
  return dashboardFor(data.role);
}

// Where a role's dashboard lives — the one copy, used by login and by the shell's nav.
export function dashboardFor(role: string | null): string {
  return (role && ROLE_ROUTES[role]) || "/dashboard/employee";
}

// ---- A2 Email 2FA: the pending challenge between the password step and the code step ----
// Kept in sessionStorage (dies with the tab), NOT localStorage: the pre-auth token is a
// short-lived, single-purpose credential and shouldn't outlive this sign-in attempt.

export type TwoFactorChallenge = {
  twoFactorRequired: true;
  preAuthToken: string;
  maskedEmail: string;
  resendCooldownSeconds: number;
};

const CHALLENGE_KEY = "twofaChallenge";
const NOTICE_KEY = "twofaNotice";

export function saveTwoFactorChallenge(challenge: TwoFactorChallenge) {
  sessionStorage.setItem(CHALLENGE_KEY, JSON.stringify(challenge));
}

export function loadTwoFactorChallenge(): TwoFactorChallenge | null {
  try {
    const raw = sessionStorage.getItem(CHALLENGE_KEY);
    return raw ? (JSON.parse(raw) as TwoFactorChallenge) : null;
  } catch {
    return null;
  }
}

export function clearTwoFactorChallenge() {
  try {
    sessionStorage.removeItem(CHALLENGE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

// A one-off message for the login page ("Too many incorrect codes…") after a 2FA bounce.
export function setLoginNotice(message: string) {
  sessionStorage.setItem(NOTICE_KEY, message);
}

export function takeLoginNotice(): string | null {
  try {
    const message = sessionStorage.getItem(NOTICE_KEY);
    sessionStorage.removeItem(NOTICE_KEY);
    return message;
  } catch {
    return null;
  }
}