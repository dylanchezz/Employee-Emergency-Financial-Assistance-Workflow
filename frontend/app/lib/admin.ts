// Admin area — ONE place for the shapes the admin pages share (were private to the admin dashboard).
// Since the admin sections became their own pages (/admin/users, /admin/departments, …), several
// pages need the same types, so they live here instead of being copied.

// The six roles the backend/schema allow. The dropdowns offer exactly these.
export const ROLES = [
  "Employee",
  "Department Supervisor",
  "Welfare Officer",
  "Finance Officer",
  "HR Manager",
  "System Administrator",
];

export type AdminUser = {
  userId: number;
  name: string;
  email: string;
  role: string;
  department: string;
  createdAt: string;
  isActive: boolean;   // C2: false = deactivated (soft-deleted)
};

// D1: one row of the canonical departments list.
export type DepartmentRow = {
  departmentId: number;
  name: string;
  createdAt: string;
  userCount: number;
};

export type ValidationRule = {
  name: string;
  value: string;
  effect: string;
};

export type AuditEntry = {
  logId: number;
  requestId: number;
  actorId: number | null;
  actorName: string | null;
  action: string;
  loggedAt: string;
};

export const ADMIN_ROLE = "System Administrator";
