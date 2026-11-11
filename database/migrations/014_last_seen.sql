-- 014_last_seen.sql
-- Enhancement F3 (task-plan Phase 6) — "live users" for the admin dashboard.
--
-- The app is stateless JWT: there is no session table to ask "who is signed in now". So presence
-- needs its own signal: users.last_seen_at, set to now() when the user makes an authenticated API
-- call — throttled in the app to at most once a minute per user (PresenceTracking), and the UPDATE
-- itself only fires when the stored value is older than that, so it never becomes a write per request.
--
-- "Active" therefore means "used the app in the last 5 minutes" (PresencePolicy.ActiveWindow) —
-- not real-time presence (that would need websockets; future work). NULL = never seen since this
-- migration. TIMESTAMPTZ, like the newer columns (disbursements, deletion requests).
--
-- One transaction; additive only (no backfill needed).

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

COMMIT;
