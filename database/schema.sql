DROP TABLE IF EXISTS audit_logs      CASCADE;
DROP TABLE IF EXISTS escalations      CASCADE;
DROP TABLE IF EXISTS notifications    CASCADE;
DROP TABLE IF EXISTS approvals        CASCADE;
DROP TABLE IF EXISTS documents        CASCADE;
DROP TABLE IF EXISTS priority_predictions CASCADE;
DROP TABLE IF EXISTS welfare_requests CASCADE;
DROP TABLE IF EXISTS users            CASCADE;


-- users
-- All system actors (Employee and the approver/admin roles) are stored
-- here, distinguished by the role column (single-table design; the class
-- model's Employee specialisation maps onto this via single-table inheritance).

CREATE TABLE users (
    user_id        SERIAL PRIMARY KEY,
    name           VARCHAR(150) NOT NULL,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role           VARCHAR(50)  NOT NULL
                   CHECK (role IN (
                       'Employee',
                       'Department Supervisor',
                       'Welfare Officer',
                       'Finance Officer',
                       'HR Manager',
                       'System Administrator'
                   )),
    department     VARCHAR(100),
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- welfare_requests
-- A submitted emergency financial assistance request.

CREATE TABLE welfare_requests (
    request_id     SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL
                   REFERENCES users(user_id) ON DELETE RESTRICT,
    category       VARCHAR(50) NOT NULL
                   CHECK (category IN (
                       'Medical Emergency',
                       'Bereavement',
                       'Hardship/Emergency Assistance',
                       'Education Support'
                   )),
    amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    description    TEXT,
    status         VARCHAR(30) NOT NULL DEFAULT 'Submitted'
                   CHECK (status IN (
                       'Submitted',
                       'Validated',
                       'Rejected',
                       'Returned',
                       'In Review',
                       'Approved',
                       'Escalated'
                   )),
    current_tier   INTEGER NOT NULL DEFAULT 0
                   CHECK (current_tier BETWEEN 0 AND 4),
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- priority_predictions
-- The Random Forest model's predicted priority for a request (one per request).

CREATE TABLE priority_predictions (
    prediction_id  SERIAL PRIMARY KEY,
    request_id     INTEGER NOT NULL UNIQUE
                   REFERENCES welfare_requests(request_id) ON DELETE CASCADE,
    priority_level VARCHAR(10) NOT NULL
                   CHECK (priority_level IN ('Low', 'Medium', 'High')),
    predicted_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- documents
-- Supporting documents uploaded with a request (metadata + file path).

CREATE TABLE documents (
    document_id    SERIAL PRIMARY KEY,
    request_id     INTEGER NOT NULL
                   REFERENCES welfare_requests(request_id) ON DELETE CASCADE,
    file_path      VARCHAR(500) NOT NULL,
    doc_type       VARCHAR(100),
    uploaded_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- approvals
-- One row per approver decision as a request moves through the four tiers.
-- The reason column records the justification for a rejected/returned request.

CREATE TABLE approvals (
    approval_id    SERIAL PRIMARY KEY,
    request_id     INTEGER NOT NULL
                   REFERENCES welfare_requests(request_id) ON DELETE CASCADE,
    approver_id    INTEGER NOT NULL
                   REFERENCES users(user_id) ON DELETE RESTRICT,
    tier           INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 4),
    decision       VARCHAR(20) NOT NULL
                   CHECK (decision IN ('Approved', 'Rejected', 'Returned')),
    reason         TEXT,
    decided_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- notifications
-- In-system and email notifications sent to users on status changes.

CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    request_id      INTEGER NOT NULL
                    REFERENCES welfare_requests(request_id) ON DELETE CASCADE,
    recipient_id    INTEGER NOT NULL
                    REFERENCES users(user_id) ON DELETE RESTRICT,
    channel         VARCHAR(20) NOT NULL
                    CHECK (channel IN ('In-System', 'Email')),
    message         TEXT NOT NULL,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- escalations
-- Records a request escalated to a higher/alternative authority when not
-- acted upon within the defined response period.

CREATE TABLE escalations (
    escalation_id  SERIAL PRIMARY KEY,
    request_id     INTEGER NOT NULL
                   REFERENCES welfare_requests(request_id) ON DELETE CASCADE,
    tier           INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 4),
    escalated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- audit_logs
-- Trail of significant actions performed on a request.

CREATE TABLE audit_logs (
    log_id         SERIAL PRIMARY KEY,
    request_id     INTEGER NOT NULL
                   REFERENCES welfare_requests(request_id) ON DELETE CASCADE,
    actor_id       INTEGER
                   REFERENCES users(user_id) ON DELETE SET NULL,
    action         VARCHAR(255) NOT NULL,
    logged_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- Helpful indexes for common lookups (foreign keys used in queries/joins)

CREATE INDEX idx_requests_user       ON welfare_requests(user_id);
CREATE INDEX idx_requests_status     ON welfare_requests(status);
CREATE INDEX idx_approvals_request   ON approvals(request_id);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX idx_audit_request       ON audit_logs(request_id);