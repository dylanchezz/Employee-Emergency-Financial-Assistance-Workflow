-- 007_add_escalate_release_action.sql
-- Feature 8: the escalation worker can forcibly release a request from a slow officer
-- (horizontal escalation). Record that as a distinct claim_events action so it can be
-- told apart from a voluntary release and counted (first lateness-while-claimed →
-- horizontal release to peers; a second → vertical escalation up a tier).

ALTER TABLE claim_events
    DROP CONSTRAINT IF EXISTS claim_events_action_check;

ALTER TABLE claim_events
    ADD CONSTRAINT claim_events_action_check
    CHECK (action IN ('claim', 'release', 'escalate_release'));