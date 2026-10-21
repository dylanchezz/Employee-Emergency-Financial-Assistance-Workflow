-- Stores the feature values submitted with a request, for reproducibility and audit.
ALTER TABLE welfare_requests
    ADD COLUMN salary                     NUMERIC(12,2),
    ADD COLUMN employment_duration_months INTEGER,
    ADD COLUMN previous_requests          INTEGER,
    ADD COLUMN request_frequency          INTEGER,
    ADD COLUMN has_documents              INTEGER;