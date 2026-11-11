using System.Net;
using backend.Data;
using backend.Models;
using backend.Requests;

namespace backend.Auth;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/auth");

        //Signup that always creates an employee
        group.MapPost("/signup", async (
            SignupRequest request,
            IUserRepository users,
            IDepartmentRepository departments) =>
        {
            //Basic Input Validation
            if (string.IsNullOrWhiteSpace(request.Name) || 
                string.IsNullOrWhiteSpace(request.Email) ||
                string.IsNullOrWhiteSpace(request.Password))
            {
                return Results.BadRequest(new {error = "Name, email, and password are required"});
            }
            // Phase 3 (A6): the shared password rule (also used by change-password + admin create).
            if (PasswordPolicy.Problem(request.Password) is { } passwordProblem)
            {
                return Results.BadRequest(new { error = passwordProblem });
            }
            // D1: department is now REQUIRED and must come from the canonical list (it drives
            // tier-1 routing). "Unassigned" is a placeholder state, not a valid choice.
            var department = request.Department?.Trim() ?? string.Empty;
            if (department.Length == 0 ||
                department == RoutingPolicy.UnassignedDepartment ||
                !await departments.ExistsAsync(department))
            {
                return Results.BadRequest(new { error = "Please choose your department from the list." });
            }
            //Reject duplicate emails
            var existing = await users.GetByEmailAsync(request.Email);
            if (existing is not null)
            {
                return Results.Conflict(new { error = "An account with this email already exists"});
            }

            //Hash the password
            var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
            
            var user = new User
            {
                Name = request.Name,
                Email = request.Email,
                PasswordHash = passwordHash,
                Role = "Employee",
                Department = department
            };

            var newId = await users.CreateAsync(user);

            return Results.Created($"/api/users/{newId}",
                new { userId = newId, email = user.Email, role = user.Role});
        });

        group.MapPost("/login", async (
            LoginRequest request,
            IUserRepository users,
            ITokenService tokenService,
            ITwoFactorCodeRepository codes,
            IEmailService email,
            LoginThrottle unknownEmails,
            HttpContext http
        ) =>
        {
            var user = await users.GetByEmailAsync(request.Email ?? string.Empty);

            // A3 (A25): a Google-only account has no password. Say so plainly rather than
            // "incorrect password" — and this guard must come BEFORE BCrypt.Verify, which
            // throws on a null hash (that would surface as a 500).
            if (user is not null && user.PasswordHash is null)
            {
                return Results.Json(
                    new { error = "This account uses Google sign-in. Please use \"Continue with Google\"." },
                    statusCode: StatusCodes.Status401Unauthorized);
            }

            // Phase 7 (A1) — unknown email: behave exactly like a real account would (401 for the
            // first N-1 tries, then the same 429 lock), via the in-memory twin. Otherwise the lock
            // itself would reveal which emails are registered.
            if (user is null)
            {
                if (unknownEmails.ActiveLock(request.Email ?? string.Empty) is { } fakeLock)
                {
                    return AuthPolicy.Locked(http, fakeLock);
                }
                var nowFakeLocked = unknownEmails.RecordFailure(request.Email ?? string.Empty);
                return nowFakeLocked is { } fl ? AuthPolicy.Locked(http, fl) : Results.Unauthorized();
            }

            // A1: a locked account is refused BEFORE the password is even checked — so the right
            // password doesn't help during the lock, and neither does 2FA (that step is never reached).
            if (user.LockedUntil is { } lockedUntil && lockedUntil > DateTime.UtcNow)
            {
                return AuthPolicy.Locked(http,
                    new DateTimeOffset(DateTime.SpecifyKind(lockedUntil, DateTimeKind.Utc), TimeSpan.Zero));
            }

            //Same response whether the email is unknown or the password is wrong.
            //An attacker cannot tell which emails are registered
            if (!BCrypt.Net.BCrypt.Verify(request.Password ?? string.Empty, user.PasswordHash))
            {
                // A1: count it (atomically, in the DB). The Nth wrong password locks the account and
                // is answered with the lock straight away — the same as the unknown-email path above.
                var nowLocked = await users.RecordFailedLoginAsync(
                    user.UserId, AuthPolicy.MaxFailedLogins, AuthPolicy.LockoutDuration);
                return nowLocked is { } nl
                    ? AuthPolicy.Locked(http, new DateTimeOffset(DateTime.SpecifyKind(nl, DateTimeKind.Utc), TimeSpan.Zero))
                    : Results.Unauthorized();
            }

            // A1: the right password (and not locked) — wipe the failure count.
            await users.ClearFailedLoginsAsync(user.UserId);

            // C2: a deactivated (soft-deleted) account can't sign in. Checked AFTER the password,
            // so only someone who knows the password learns the account is deactivated (anyone
            // else still gets the vague 401 above), and BEFORE both the real token and the 2FA
            // step — so a deactivated 2FA user isn't even emailed a code.
            if (!user.IsActive)
            {
                return Results.Json(new { error = "This account has been deactivated." },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            // A2 Email 2FA: an enrolled user gets a code by email and a pre-auth token —
            // NOT the real JWT. The real token is only minted by /verify-2fa after a correct code.
            if (user.TwoFactorEnabled)
            {
                var sent = await TwoFactorCodeSender.IssueAndSendAsync(
                    user, freshLoginAttempt: true, codes, email);
                if (!sent)
                {
                    // No email → the user could never finish, so don't leave a dead code behind.
                    await codes.DeleteAllForUserAsync(user.UserId);
                    return Results.Json(
                        new { error = "We couldn't send your sign-in code by email. Please try again later or contact your administrator." },
                        statusCode: StatusCodes.Status503ServiceUnavailable);
                }

                return Results.Ok(new TwoFactorChallengeResponse(
                    TwoFactorRequired: true,
                    PreAuthToken: tokenService.CreatePreAuthToken(user),
                    MaskedEmail: TwoFactorCodeSender.MaskEmail(user.Email),
                    ResendCooldownSeconds: (int)TwoFactorPolicy.ResendCooldown.TotalSeconds));
            }

            // Not enrolled: one-step login, exactly as before A2.
            var token = tokenService.CreateToken(user);

            return Results.Ok(new AuthResponse(
                user.UserId, user.Name, user.Email, user.Role, token));
        });

        //Logout. Client discards the token
        group.MapPost("/logout", () =>
        {
            return Results.Ok(new { message = "Logged Out. Please discard your token"});
        });
    }
}
