"use client";

// Wraps every admin page. The backend already refuses non-admins (403); this just shows a clear
// message instead of a page of failed requests, and doesn't even mount the page's data loading.

import Link from "next/link";
import { useSession } from "@/app/lib/session";
import { ADMIN_ROLE } from "@/app/lib/admin";
import { EmptyState } from "@/app/components/ui/Ui";
import { ShieldIcon } from "@/app/components/icons";

export default function AdminOnly({ children }: { children: React.ReactNode }) {
  const { ready, role } = useSession();
  if (!ready) return null;
  if (role !== ADMIN_ROLE) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <EmptyState
          icon={ShieldIcon}
          title="Administrators only"
          body="This page is part of the admin area. Your account doesn't have access to it."
          action={<Link href="/" className="text-sm font-medium text-kq-red hover:underline">Go to the home page</Link>}
        />
      </div>
    );
  }
  return <>{children}</>;
}
