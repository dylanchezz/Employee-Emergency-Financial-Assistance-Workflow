using System.Data.Common;
using System.Security.Principal;
using System.Text;
using backend.Data;
using Dapper;
using Microsoft.OpenApi;
using Microsoft.IdentityModel.Tokens;
using backend.Auth;
using backend.Requests;
using System.IdentityModel.Tokens.Jwt;
using backend.M1;

// Keep JWT claim names as-is (don't remap "sub" to the long .NET URI).
JwtSecurityTokenHandler.DefaultInboundClaimTypeMap.Clear();
var builder = WebApplication.CreateBuilder(args);

//Add services to the container
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Paste your JWT here (no need to type 'Bearer ')."
    });
});

//Bind the "jwt" config section onto a JwtSettings object and register it.
var jwtSettings = builder.Configuration.GetSection("Jwt").Get<JwtSettings>()
    ?? throw new InvalidOperationException("Jwt settings are missing from configuration.");
builder.Services.AddSingleton(jwtSettings);

//Data and Authentication Services
builder.Services.AddSingleton<IDbConnectionFactory, DbConnectionFactory>();
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<IWelfareRequestRepository, WelfareRequestRepository>();
builder.Services.AddScoped<IValidationService, ValidationService>();
builder.Services.AddScoped<IPriorityPredictionRepository, PriorityPredictionRepository>();
builder.Services.AddScoped<IApprovalRepository, ApprovalRepository>();
builder.Services.AddScoped<IDocumentRepository, DocumentRepository>();
builder.Services.AddScoped<IClaimRepository, ClaimRepository>();
builder.Services.AddScoped<INotificationRepository, NotificationRepository>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddHostedService<EscalationWorker>();
builder.Services.AddScoped<IAuditRepository, AuditRepository>();
builder.Services.Configure<EmailSettings>(builder.Configuration.GetSection("Email"));
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<ITwoFactorCodeRepository, TwoFactorCodeRepository>();
builder.Services.AddScoped<IDepartmentRepository, DepartmentRepository>();   // D1
builder.Services.AddScoped<IDisbursementRepository, DisbursementRepository>();   // D2

// A3 Google sign-in: settings (secret from gitignored config only) + a typed HttpClient for
// the server-to-server code exchange with Google.
builder.Services.Configure<GoogleAuthSettings>(builder.Configuration.GetSection("GoogleAuth"));
builder.Services.AddHttpClient<IGoogleAuthService, GoogleAuthService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(10);
});

//Typed HttpClient for FastAPI model service
var mlBaseUrl = builder.Configuration["MlService:BaseUrl"]
    ?? throw new InvalidOperationException("MlService:BaseUrl is missing from configuration.");

builder.Services.AddHttpClient<IModelService, ModelService>(client =>
{
    client.BaseAddress = new Uri(mlBaseUrl);
    client.Timeout = TimeSpan.FromSeconds(5);
});

builder.Services.AddAuthentication("Bearer")
    .AddJwtBearer("Bearer", options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings.Issuer,
            ValidAudience = jwtSettings.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtSettings.Secret))
        };
    })
    // A2 Email 2FA: a SECOND bearer scheme that accepts only the pre-auth token (audience
    // "verify-2fa"). "Bearer" above stays the default scheme and expects the app audience, so a
    // pre-auth token fails everywhere except the two endpoints that opt into this scheme.
    // The reverse also holds: a real app JWT has the wrong audience for this scheme.
    .AddJwtBearer(TwoFactorPolicy.PreAuthScheme, options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings.Issuer,
            ValidAudience = TwoFactorPolicy.PreAuthAudience,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtSettings.Secret)),
            // The default 5-minute ClockSkew (seen in the A24 JWT test) would stretch a 10-minute
            // pre-auth token to 15. Issuer and validator are the same server, so no skew is needed.
            ClockSkew = TimeSpan.Zero,
        };
    });

builder.Services.AddAuthorization(options =>
{
    // Used ONLY by /verify-2fa and /resend-2fa: authenticate with the PreAuth scheme and
    // require the twofa_pending claim (belt and braces on top of the audience check).
    options.AddPolicy(TwoFactorPolicy.PreAuthPolicy, policy => policy
        .AddAuthenticationSchemes(TwoFactorPolicy.PreAuthScheme)
        .RequireAuthenticatedUser()
        .RequireClaim(TwoFactorPolicy.PendingClaim, "true"));
});

//Allow the Next.js dev frontend to call this API.
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins("http://localhost:3000")
        .AllowAnyHeader()
        .AllowAnyMethod();
    });  
});

var app = builder.Build();




//HTTP request pipeline configuration
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowFrontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", () => "Welfare Assistance API is running");

//Check that API can reach the database
app.MapGet("/api/health/db", async (IDbConnectionFactory factory) =>
{
    try
    {
        using var connection = factory.CreateConnection();
        var result = await connection.QuerySingleAsync<int>("SELECT 1;");
        return Results.Ok(new { status = "ok", database = "connected", result });
    }
    catch (Exception ex)
    {
        return Results.Problem(
            title: "Database connection failed",
            detail: ex.Message,
            statusCode: 503);
    }
});

app.MapAuthEndpoints();
app.MapTwoFactorEndpoints();
app.MapGoogleAuthEndpoints();
app.MapDepartmentEndpoints();   // D1
app.MapProtectedTestEndpoints();
app.MapRequestEndpoints();
app.MapNotificationEndpoints();
app.MapAdminEndpoints();
app.Run();