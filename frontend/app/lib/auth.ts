// Shared sign-out logic, used by every dashboard.
// JWTs are stateless — the server keeps no session — so signing out means the
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
}