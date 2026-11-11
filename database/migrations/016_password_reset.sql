-- 016_password_reset.sql
-- Enhancement A4 (task-plan Phase 7) — "forgot password" via an emailed, single-use reset link.
--
-- password_reset_tokens mirrors two_factor_codes (A2): the secret is a credential, so only its HASH is
-- stored. Unlike a 6-digit 2FA code, a reset token is 32 random bytes (256 bits), so a fast SHA-256
-- hash is the right tool here (no brute-force risk, and it can be looked up directly by hash) —
-- BCrypt's slowness is only needed for low-entropy secrets like passwords and short codes.
--   expires_at  the link's lifetime (AuthPolicy.ResetTokenLifetime)
--   used_at     set when consumed — single use, enforced by a conditional write in the app
-- ON DELETE CASCADE: tokens are throwaway and belong to the user.
--
-- One transaction; additive.

BEGIN;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_id    SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL
                REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash  CHAR(64) NOT NULL UNIQUE,      -- hex SHA-256 of the emailed token
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
    ON password_reset_tokens (user_id);

COMMIT;
