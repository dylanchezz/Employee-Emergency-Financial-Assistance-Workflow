using System.Net;
using backend.Data;
using backend.Models;

namespace backend.Auth;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/auth");

        //Signup that always creates an employee
        group.MapPost("/signup", async (
            SignupRequest request,
            IUserRepository users) =>
        {
            //Basic Input Validation
            if (string.IsNullOrWhiteSpace(request.Name) || 
                string.IsNullOrWhiteSpace(request.Email) ||
                string.IsNullOrWhiteSpace(request.Password))
            {
                return Results.BadRequest(new {error = "Name, email, and password are required"});
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
                Department = request.Department
            };

            var newId = await users.CreateAsync(user);

            return Results.Created($"/api/users/{newId}",
                new { userId = newId, email = user.Email, role = user.Role});
        });

        group.MapPost("/login", async (
            LoginRequest request,
            IUserRepository users,
            ITokenService tokenService
        ) =>
        {
            var user = await users.GetByEmailAsync(request.Email);

            //Same response whether the email is unknown or the password is wrong.
            //An attacker cannot tell which emails are registered
            if (user is null || 
                !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            {
                return Results.Unauthorized();
            }

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
