namespace backend.Auth;

//What the client sends to signup. Defaults to creating an employee role
public record SignupRequest(string Name, string Email, string Password, string Department);

//What the client sends to login
public record LoginRequest(string Email, string Password);

//What the server sends back after login
public record AuthResponse(int UserId, string Name, string Email, string Role, string Token);
