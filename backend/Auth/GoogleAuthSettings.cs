namespace backend.Auth;

// A3 Google sign-in settings, bound from the "GoogleAuth" config section.
// Real values live ONLY in the gitignored appsettings.Development.json (or environment
// variables GoogleAuth__ClientId / GoogleAuth__ClientSecret) — placeholders in the example files.
public class GoogleAuthSettings
{
    // Public identifier of our app at Google (also used by the frontend button).
    public string ClientId { get; set; } = string.Empty;

    // Secret used only server-side to exchange an authorization code. Never sent to the browser.
    public string ClientSecret { get; set; } = string.Empty;

    // Missing values → Google sign-in is switched off (503) instead of crashing startup,
    // so a fresh clone without Google credentials still runs.
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret);
}
