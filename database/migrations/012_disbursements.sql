-- 012_disbursements.sql
-- Enhancement D2 — Finance-disbursed payout (scope locked in Impact Log A23).
--
-- Until now HR's approval at tier 4 was terminal (status 'Approved'). In the real process the
-- money still has to be paid out, so D2 adds a final, post-approval step:
--
--   … → Approved (HR, tier 4) → Finance disburses → Disbursed (terminal)
--
-- 'Approved' now means "approved, awaiting disbursement"; 'Disbursed' is the new end state.
-- Disbursing is keyed on STATUS, not tier — it is separate from Finance's tier-3 review.
--
-- 1. Extend the status CHECK to allow 'Disbursed'. A CHECK can't be altered in place, so it is
--    dropped and re-added with the extra value. Its real name, read from pg_constraint before
--    writing this, is welfare_requests_status_check (the same name migration 005 used). Every
--    existing value — including the never-used 'Escalated' (Impact Log note) — is kept as is.
--
-- 2. disbursements — one row per paid request. Like a deferral, a disbursement is NOT an
--    approvals-table decision (approvals' CHECK allows only Approved/Rejected/Returned), so it
--    gets its own table. UNIQUE(request_id) means a request can be paid at most once — half of
--    the double-pay guard (the other half is the conditional Approved → Disbursed write in the
--    app). amount is copied from the request at the moment of payment (no partial payments).
--    ON DELETE RESTRICT on disbursed_by, matching approvals: a payment record keeps its payer.
--
-- Run as one transaction: if any step fails, nothing is half-applied.

BEGIN;

ALTER TABLE welfare_requests
    DROP CONSTRAINT IF EXISTS welfare_requests_status_check;

ALTER TABLE welfare_requests
    ADD CONSTRAINT welfare_requests_status_check
        CHECK (status IN (
            'Submitted',
            'Validated',
            'Rejected',
            'Returned',
            'In Review',
            'Approved',
            'Escalated',
            'Deferred',
            'Disbursed'
        ));

CREATE TABLE IF NOT EXISTS disbursements (
    disbursement_id  SERIAL PRIMARY KEY,
    request_id       INTEGER NOT NULL UNIQUE
                     REFERENCES welfare_requests(request_id) ON DELETE CASCADE,
    disbursed_by     INTEGER NOT NULL
                     REFERENCES users(user_id) ON DELETE RESTRICT,
    amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    reference        VARCHAR(100),
    note             TEXT,
    disbursed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
