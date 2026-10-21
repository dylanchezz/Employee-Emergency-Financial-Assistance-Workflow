--Stores per-request SHAP top factors as JSONB
ALTER TABLE priority_predictions
    ADD COLUMN explanation JSONB;