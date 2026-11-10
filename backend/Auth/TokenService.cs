using System.IdentityModel.Tokens.Jwt;
using System.Reflection.Metadata;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using backend.Models;
using Microsoft.IdentityModel.Tokens;

namespace backend.Auth;

public interface ITokenService
{
    string CreateToken(User user);

    // A2 Email 2FA: the short-lived "password OK, code still pending" token. It carries only
    // the user id + twofa_pending — no role, name or email — and a different audience, so it
    // is useless anywhere except /verify-2fa and /resend-2fa.
    string CreatePreAuthToken(User user);
}

public class TokenService : ITokenService
{
    private readonly JwtSettings _settings;

    public TokenService(JwtSettings settings)
    {
        _settings = settings;
    }
    public string CreateToken(User user)
    {
        //The facts that the token carries about the user
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.UserId.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Name, user.Name),
            new Claim(ClaimTypes.Role, user.Role)
        };
    var key =  new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_settings.Secret));
    var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

    //Assembling the token(Issuer, audience, claims, expiry, signature)
    var token = new JwtSecurityToken(
        issuer: _settings.Issuer,
        audience: _settings.Audience,
        claims: claims,
        expires: DateTime.UtcNow.AddMinutes(_settings.ExpiryMinutes),
        signingCredentials: credentials);

    //Serialize the key to compact header.payload.signature string
    return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string CreatePreAuthToken(User user)
    {
        // Deliberately minimal: no Role claim, so even if the audience check were somehow
        // bypassed, no role-gated endpoint would accept it.
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.UserId.ToString()),
            new Claim(TwoFactorPolicy.PendingClaim, "true"),
        };
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_settings.Secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        // Same issuer + signing key as the real token, but a DIFFERENT audience. The normal
        // "Bearer" scheme only accepts the app audience, so it rejects this token everywhere.
        var token = new JwtSecurityToken(
            issuer: _settings.Issuer,
            audience: TwoFactorPolicy.PreAuthAudience,
            claims: claims,
            expires: DateTime.UtcNow.Add(TwoFactorPolicy.PreAuthTokenLifetime),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}