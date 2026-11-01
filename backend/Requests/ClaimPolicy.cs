namespace backend.Requests;

// Claiming policy constants, kept in one place so they're easy to change.
public static class ClaimPolicy
{
    // The maximum number of times a single approver may claim the same request.
    // After this many claims, further claim attempts by that approver are refused.
    // (Example: 2 → claim, release, claim, release, then the 3rd claim is blocked.)
    public const int MaxClaimsPerApprover = 2;
}