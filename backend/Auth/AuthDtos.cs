namespace backend.Auth;

//What the client sends to signup. Defaults to creating an employee role
public record SignupRequest(string Name, string Email, string Password, string? Department);

//What the client sends to login
public record LoginRequest(string Email, string Password);

//What the server sends back after login
public record AuthResponse(int UserId, string Name, string Email, string Role, string Token);

// A2 Email 2FA: login for an enrolled user stops here. NOT the real JWT — only the pre-auth
// token, which works on /verify-2fa and /resend-2fa and nowhere else.
public record TwoFactorChallengeResponse(
    bool TwoFactorRequired, string PreAuthToken, string MaskedEmail, int ResendCooldownSeconds);

// A2: the code the user typed from their email.
public record VerifyTwoFactorRequest(string Code);

// A3: the one-time authorization code the Google popup gave the browser.
public record GoogleSignInRequest(string Code);
// Admin: create a user with any role.
public record CreateUserRequest(string Name, string Email, string Password, string Role, string? Department);

// Admin: change a user's role.
public record ChangeRoleRequest(string Role);

// D1: a department name chosen from the canonical list (self-service, admin user edit).
public record ChooseDepartmentRequest(string? Department);

// D1: admin creates a department.
public record CreateDepartmentRequest(string? Name);

// C2: optional reason on an account-deletion request (from the user) or a rejection (from the admin).
public record DeletionRequestBody(string? Reason);

// Phase 3 (A6): change your own password.
public record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);
