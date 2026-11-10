"use client";

// Phase 3 — one way to read the signed-in session (token / role / name) from localStorage.
//
// Why useSyncExternalStore: localStorage is an EXTERNAL store, which is exactly what this React
// hook is for. On the server it returns `undefined` ("not known yet"), in the browser the real
// value — so server and client render the same first frame (no hydration mismatch), and we avoid
// the "setState inside an effect" pattern the linter flags. Values are plain strings, so React
// can compare snapshots cheaply.

import { useSyncExternalStore } from "react";

const SESSION_EVENT = "session-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);      // other tabs
  window.addEventListener(SESSION_EVENT, onChange);  // this tab (see notifySessionChanged)
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SESSION_EVENT, onChange);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function useStoredValue(key: string): string | null | undefined {
  return useSyncExternalStore(subscribe, () => read(key), () => undefined);
}

// Call after changing the session in THIS tab (sign-in / sign-out) so subscribers re-read it.
export function notifySessionChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EVENT));
}

export type Session = {
  ready: boolean;          // false during the server render / first paint
  token: string | null;
  role: string | null;
  name: string | null;
};

export function useSession(): Session {
  const token = useStoredValue("token");
  const role = useStoredValue("role");
  const name = useStoredValue("name");
  return { ready: token !== undefined, token: token ?? null, role: role ?? null, name: name ?? null };
}

export const APPROVER_ROLES = ["Department Supervisor", "Welfare Officer", "Finance Officer", "HR Manager"];
export const isApproverRole = (role: string | null) => role != null && APPROVER_ROLES.includes(role);
