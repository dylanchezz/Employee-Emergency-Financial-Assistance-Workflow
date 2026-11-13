"use client";

// Admin → Account requests (was the "Account requests" tab). C2: account-deletion requests —
// approving deactivates the account (soft-delete). The queue component is unchanged.

import DeletionRequestsQueue from "@/app/components/DeletionRequestsQueue";
import AdminOnly from "@/app/components/admin/AdminOnly";
import { PageHeader } from "@/app/components/ui/Ui";

export default function AdminAccountRequestsPage() {
  return (
    <AdminOnly>
      <div className="mx-auto w-full max-w-4xl">
        <PageHeader
          title="Account requests"
          subtitle="Requests to delete an account. Approving deactivates it (soft-delete): no more sign-in, but its history is kept for the audit trail."
        />
        <DeletionRequestsQueue showHeading={false} />
      </div>
    </AdminOnly>
  );
}
