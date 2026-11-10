// Phase 4 (B1): public route constants, in a module with NO imports and no "use client", so both
// server components (the landing page) and client components can import it. lib/auth re-exports
// LOGIN_PATH, so there is still exactly ONE definition of where the login form lives.

// The login form moved from "/" to "/login" ("/" is now the public landing page). Every
// "go to login" redirect uses this constant — 12 places used to hard-code "/".
export const LOGIN_PATH = "/login";
