namespace backend.Requests;

// D1 — department-scoped routing. The routing rules live here, in ONE place, in the same style
// as ClaimPolicy / EscalationPolicy, so the submit path, the resubmit fallback and the docs can
// never disagree about where a request enters review.
public static class RoutingPolicy
{
    // The catch-all department (migration 011) for accounts that haven't chosen one yet.
    // Such an account must choose a real department before it can submit a request.
    public const string UnassignedDepartment = "Unassigned";

    // Tier 1 is the only DEPARTMENT-SCOPED tier: a Department Supervisor reviews only requests
    // from employees in their own department. Tiers 2–4 (Welfare/Finance/HR) are cross-cutting.
    public const int DepartmentScopedTier = 1;

    // The tier a request enters when it passes the automatic checks. THE single decision point
    // (D1 build decision 3) — the submit endpoint and the resubmit fallback both call this.
    //
    // A Department Supervisor's OWN request skips tier 1 and enters at tier 2 (Welfare Officer):
    // they ARE the tier-1 authority for their department, so tier 1 would be a self-review
    // (which the A24 #2 self-approval guard would block anyway). Welfare is the first
    // cross-cutting reviewer, and skipping to it always works — even in a department with only
    // one supervisor. (Peer-supervisor review is a possible future variant.)
    public static int InitialTierFor(string submitterRole) =>
        submitterRole == "Department Supervisor" ? 2 : 1;

    // Phase 5 (E3): the role that staffs a tier — for "Note from the {role}" on the detail page.
    public static string? RoleForTier(int tier) => tier switch
    {
        1 => "Department Supervisor",
        2 => "Welfare Officer",
        3 => "Finance Officer",
        4 => "HR Manager",
        _ => null,
    };
}
