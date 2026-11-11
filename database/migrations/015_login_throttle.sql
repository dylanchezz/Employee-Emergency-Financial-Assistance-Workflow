-- 015_login_throttle.sql
-- Enhancement A1 (task-plan Phase 7) — brute-force protection on PASSWORD login (NFR-01).
-- Separate from the 2FA code lockout (A2): that counts wrong *codes*; this counts wrong *passwords*.
--
-- Per-ACCOUNT counter (build decision 1; per-IP tracking is future work):
--   failed_login_count  consecutive wrong passwords since the last successful sign-in
--   locked_until        while in the future, password sign-in is refused (HTTP 429) — even with the
--                       right password; set when the count reaches AuthPolicy.MaxFailedLogins
-- A correct password (when not locked) resets both; so does a password reset (A4).
-- The thresholds live in the app (AuthPolicy), not here, so the demo can tune them.
--
-- One transaction; additive (existing users start at 0 / not locked).

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until       TIMESTAMPTZ;

COMMIT;
