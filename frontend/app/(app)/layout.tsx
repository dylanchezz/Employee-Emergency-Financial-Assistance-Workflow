// Phase 3 (Part 0, build decision 1): a ROUTE GROUP. The "(app)" folder name adds nothing to the
// URL — /dashboard/…, /requests/…, /profile, /notifications, /my-requests, /track stay as they
// are — but every page inside it shares THIS layout, so the sidebar + navbar mount once and
// persist across navigation (no re-render, no duplicated nav). The public pages (login, signup,
// verify-2fa) live outside the group and keep their own full-screen layouts.
import AppShell from "../components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
