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
    });

builder.Services.AddAuthorization();

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
app.MapProtectedTestEndpoints();
app.MapRequestEndpoints();
app.Run();