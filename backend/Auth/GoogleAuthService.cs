using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace backend.Auth;

// The verified facts we take from Google about the person signing in.
public record GoogleIdentity(string Subject, string Email, bool EmailVerified, string? Name);

public interface IGoogleAuthService
{
    // Exchange the authorization code from the GIS popup for Google's ID token, validate it,
    // and return the identity. Null = the code was rejected or the token failed validation.
    Task<GoogleIdentity?> ExchangeCodeAsync(string code);
}

// A3 (A25): OUR backend talks to Google — the browser only ever sees the one-time code.
// 1. POST the code + our client secret to Google's token endpoint (server-to-server, TLS).
// 2. Validate the returned ID token properly: Google's signing keys (fetched from Google's
//    published OpenID configuration and cached), issuer, audience = OUR client id, expiry.
// Uses Microsoft.IdentityModel packages already pulled in by JwtBearer — no new dependency.
public class GoogleAuthService : IGoogleAuthService
{
    private const string TokenEndpoint = "https://oauth2.googleapis.com/token";

    // Google's discovery document; the manager caches the signing keys and refreshes them.
    // Static so the cache is shared across requests (the service itself is per-request).
    private static readonly ConfigurationManager<OpenIdConnectConfiguration> GoogleConfig =
        new("https://accounts.google.com/.well-known/openid-configuration",
            new OpenIdConnectConfigurationRetriever(),
            new HttpDocumentRetriever());

    private readonly HttpClient _http;
    private readonly GoogleAuthSettings _settings;
    private readonly ILogger<GoogleAuthService> _logger;

    public GoogleAuthService(HttpClient http, IOptions<GoogleAuthSettings> settings, ILogger<GoogleAuthService> logger)
    {
        _http = http;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<GoogleIdentity?> ExchangeCodeAsync(string code)
    {
        // Step 1: code → tokens. redirect_uri "postmessage" is Google's fixed value for codes
        // obtained by the GIS popup (the code was delivered to our page, not to a redirect URL).
        using var form = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["code"] = code,
            ["client_id"] = _settings.ClientId,
            ["client_secret"] = _settings.ClientSecret,
            ["redirect_uri"] = "postmessage",
            ["grant_type"] = "authorization_code",
        });

        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsync(TokenEndpoint, form);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Google token endpoint unreachable.");
            return null;
        }

        if (!response.IsSuccessStatusCode)
        {
            // Body is Google's error JSON (e.g. invalid_grant for a reused/expired code) —
            // contains no secrets, useful when testing.
            _logger.LogWarning("Google code exchange failed: {Status} {Body}",
                (int)response.StatusCode, await response.Content.ReadAsStringAsync());
            return null;
        }

        var tokens = await response.Content.ReadFromJsonAsync<GoogleTokenResponse>();
        if (string.IsNullOrEmpty(tokens?.IdToken))
        {
            _logger.LogWarning("Google code exchange returned no id_token.");
            return null;
        }

        // Step 2: validate the ID token.
        var config = await GoogleConfig.GetConfigurationAsync(CancellationToken.None);
        var result = await new JsonWebTokenHandler().ValidateTokenAsync(tokens.IdToken, new TokenValidationParameters
        {
            ValidIssuers = new[] { "https://accounts.google.com", "accounts.google.com" },
            ValidAudience = _settings.ClientId,
            IssuerSigningKeys = config.SigningKeys,
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
        });

        if (!result.IsValid)
        {
            _logger.LogWarning(result.Exception, "Google ID token failed validation.");
            return null;
        }

        string? Claim(string type) =>
            result.Claims.TryGetValue(type, out var value) ? value?.ToString() : null;

        var subject = Claim("sub");
        var email = Claim("email");
        if (string.IsNullOrEmpty(subject) || string.IsNullOrEmpty(email))
        {
            _logger.LogWarning("Google ID token lacked sub or email.");
            return null;
        }

        var verified = string.Equals(Claim("email_verified"), "true", StringComparison.OrdinalIgnoreCase);
        return new GoogleIdentity(subject, email, verified, Claim("name"));
    }

    private sealed class GoogleTokenResponse
    {
        [JsonPropertyName("id_token")]
        public string? IdToken { get; set; }
    }
}
