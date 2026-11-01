-- Feature 5 [CORE]: pull-based claiming + Finance 'Deferred'.
--   * welfare_requests.claimed_by: which approver currently holds the request
--     (NULL = unclaimed, i.e. in the shared tier pool). FK to users.
--   * claim_events: one row per claim/release action — this is both the claim
--     history (audit) and how we count an approver's prior claims on a request
--     to enforce the per-official claim cap.
--   * Extend the status CHECK constraint to allow 'Deferred' (Finance may defer a
--     request when funds are temporarily unavailable; it stays at the Finance tier
--     and is re-actionable later).

ALTER TABLE welfare_requests
    ADD COLUMN IF NOT EXISTS claimed_by INTEGER
        REFERENCES users(user_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS claim_events (
    claim_event_id SERIAL PRIMARY KEY,
    request_id     INTEGER NOT NULL
                   REFERENCES welfare_requests(request_id) ON DELETE CASCADE,
    approver_id    INTEGER NOT NULL
                   REFERENCES users(user_id) ON DELETE RESTRICT,
    action         VARCHAR(20) NOT NULL
                   CHECK (action IN ('claim', 'release')),
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_claim_events_request_approver
    ON claim_events(request_id, approver_id);

-- Extend the status CHECK to permit 'Deferred'. A CHECK constraint can't be
-- altered in place, so drop and recreate it with the extra allowed value.
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
        'Deferred'
    ));