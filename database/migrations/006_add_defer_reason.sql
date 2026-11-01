-- 006_add_defer_reason.sql
-- Feature 5: when the Finance Officer defers a request (funds temporarily unavailable),
-- they must give a reason. Stored here on the request (the approvals table's CHECK only
-- allows Approved/Rejected/Returned, so a defer reason can't live there).

ALTER TABLE welfare_requests
    ADD COLUMN IF NOT EXISTS defer_reason TEXT;