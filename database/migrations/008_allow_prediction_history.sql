-- 008_allow_prediction_history.sql
-- Resubmit feature: a Returned request can be edited and resubmitted (same request_id).
-- On resubmit it is re-classified, producing a NEW prediction. We keep the old prediction
-- too, so the priority history is visible (e.g. "was Low -> now Medium").
--
-- The original table had request_id UNIQUE, which allowed only ONE prediction per request.
-- Drop that so a request can hold several predictions over its lifetime; the app reads the
-- latest by predicted_at. (An index on request_id keeps that lookup fast now that the
-- unique index that used to back it is gone.)

ALTER TABLE priority_predictions
    DROP CONSTRAINT IF EXISTS priority_predictions_request_id_key;

CREATE INDEX IF NOT EXISTS idx_priority_predictions_request_id
    ON priority_predictions (request_id);