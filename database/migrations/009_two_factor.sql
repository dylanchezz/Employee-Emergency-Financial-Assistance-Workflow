-- 009_two_factor.sql
-- Enhancement A2 — Email 2FA (opt-in two-step login). Design locked in Impact Log A25.
--
-- 1. users.two_factor_enabled — the per-user opt-in flag. DEFAULT false, so every existing
--    (seeded/demo) account stays on one-step login; nobody is enrolled by this migration.
--
-- 2. two_factor_codes — the short-lived one-time codes emailed at login. A dedicated table
--    (not columns on users) so a code's lifecycle (expiry, attempt counter, resend history)
--    is kept separate from the account. The code is a credential, so only its BCrypt HASH
--    is stored, never the 6 digits themselves (same principle as password_hash).
--    timestamptz (not the older tables' TIMESTAMP) because expiry is compared against now()
--    and must be unambiguous about time zone.
--    ON DELETE CASCADE: codes are throwaway, so deleting a user takes their codes with them.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS two_factor_codes (
    code_id     SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL
                REFERENCES users(user_id) ON DELETE CASCADE,
    code_hash   TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every lookup is "the latest code for this user", so index user_id.
CREATE INDEX IF NOT EXISTS idx_two_factor_codes_user_id
    ON two_factor_codes (user_id);
