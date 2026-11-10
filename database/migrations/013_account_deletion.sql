-- 013_account_deletion.sql
-- Enhancement C2 — account deletion as SOFT-DELETE (scope locked in Impact Log A23).
--
-- A user REQUESTS deletion → an admin APPROVES → the account is DEACTIVATED: it can no longer
-- sign in, but every row it is part of stays. A hard DELETE is deliberately not offered: the
-- audit / approval / claim foreign keys (ON DELETE RESTRICT) exist so the FR-11 trail survives,
-- and erasing a user would destroy it. That is the right-to-erasure vs audit-retention tension;
-- deactivation is the answer that respects both (the account is gone from use, the record isn't).
--
-- 1. users.is_active (default true → every existing account stays active) + deactivated_at.
-- 2. account_deletion_requests — the request and the admin's decision, kept as their own history
--    (who asked, when, who decided, when). An ACCOUNT-level record, so it lives here rather than
--    in the request-scoped audit_logs (same reasoning as the 2FA / department events).
-- 3. One PENDING request per user: a partial unique index (only rows with status 'Pending' are
--    indexed), so a user can have many past requests but never two open ones at once.
--
-- Run as one transaction: if any step fails, nothing is half-applied.

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS account_deletion_requests (
    deletion_id   SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL
                  REFERENCES users(user_id) ON DELETE CASCADE,
    status        VARCHAR(20) NOT NULL DEFAULT 'Pending'
                  CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
    reason        TEXT,
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_by    INTEGER
                  REFERENCES users(user_id) ON DELETE SET NULL,
    decided_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_deletion_one_pending
    ON account_deletion_requests (user_id)
    WHERE status = 'Pending';

COMMIT;
