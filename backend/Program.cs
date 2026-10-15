using backend.Data;
using Dapper;

var builder = WebApplication.CreateBuilder(args);

//Add services to the container
builder.Services.AddOpenApi();

//Register database connection factory so it can be injected to endpoints
builder.Services.AddSingleton<IDbConnectionFactory, DbConnectionFactory>();

var app = builder.Build();

//HTTP request pipeline configuration
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
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

app.Run();