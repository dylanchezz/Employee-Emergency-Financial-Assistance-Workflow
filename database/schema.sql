DROP TABLE IF EXISTS account_deletion_requests CASCADE;
DROP TABLE IF EXISTS disbursements    CASCADE;
DROP TABLE IF EXISTS two_factor_codes CASCADE;
DROP TABLE IF EXISTS audit_logs      CASCADE;
DROP TABLE IF EXISTS escalations      CASCADE;
DROP TABLE IF EXISTS notifications    CASCADE;
DROP TABLE IF EXISTS approvals        CASCADE;
DROP TABLE IF EXISTS documents        CASCADE;
DROP TABLE IF EXISTS priority_predictions CASCADE;
DROP TABLE IF EXISTS welfare_requests CASCADE;
DROP TABLE IF EXISTS users            CASCADE;
DROP TABLE IF EXISTS departments      CASCADE;


-- departments
-- D1 (migration 011): the canonical, admin-managed department list. users.department is a
-- FK to name (natural key, ON UPDATE CASCADE). "Unassigned" is the catch-all for accounts
-- that haven't chosen yet (e.g. Google sign-ups); they must choose before submitting.

CREATE TABLE departments (
    department_id  SERIAL PRIMARY KEY,
    name           VARCHAR(100) NOT NULL UNIQUE,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO departments (name) VALUES ('Unassigned');


-- users
-- All system actors (Employee and the approver/admin roles) are stored
-- here, distinguished by the role column (single-table design; the class
-- model's Employee specialisation maps onto this via single-table inheritance).

CREATE TABLE users (
    user_id        SERIAL PRIMARY KEY,
    name           VARCHAR(150) NOT NULL,
    email          VARCHAR(255) NOT NULL UNIQUE,
    -- NULL for a Google-only account (A3, migration 010).
    password_hash  VARCHAR(255),
    role           VARCHAR(50)  NOT NULL
                   CHECK (role IN (
                       'Employee',
                       'Department Supervisor',
                       'Welfare Officer',
                       'Finance Officer',
                       'HR Manager',
                       'System Administrator'
                   )),
    -- D1 (migration 011): required; FK to departments(name). Tier-1 routing reads it.
    department     VARCHAR(100) NOT NULL DEFAULT 'Unassigned'
                   REFERENCES departments(name) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- A2 Email 2FA opt-in flag (migration 009). Off by default.
    two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
    -- A3 Google sign-in identity (migration 010): provider + the provider's stable subject id.
    oauth_provider VARCHAR(20),
    oauth_subject  VARCHAR(255),
    -- C2 (migration 013): soft-delete. A deactivated account can't sign in; its history stays.
    is_active      BOOLEAN NOT NULL DEFAULT true,
    deactivated_at TIMESTAMPTZ,
    -- Phase 6 / F3 (migration 014): last authenticated API call, throttled to ~1/min. "Active now"
    -- = seen in the last 5 minutes (not live presence). NULL = not seen since 014.
    last_seen_at   TIMESTAMPTZ,
    CONSTRAINT users_oauth_pair_chk
        CHECK ((oauth_provider IS NULL) = (oauth_subject IS NULL)),
    CONSTRAINT users_has_login_method_chk
        CHECK (password_hash IS NOT NULL OR oauth_subject IS NOT NULL),
    CONSTRAINT users_oauth_identity_key
        UNIQUE (oauth_provider, oauth_subject)
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

    -- Model-input snapshot: the feature values submitted with (or derived for)
    -- the request. Stored for reproducibility and audit; the model also uses
    -- them live at classification time. salary and employment_duration_months
    -- come from the submitter; previous_requests and request_frequency are
    -- derived by the system from the user's request history.
    salary                     NUMERIC(12,2),
    employment_duration_months INTEGER,
    previous_requests          INTEGER,
    request_frequency          INTEGER,
    has_documents              INTEGER,
    validation_note            TEXT,

    status         VARCHAR(30) NOT NULL DEFAULT 'Submitted'
                   CHECK (status IN (
                       'Submitted',
                       'Validated',
                       'Rejected',
                       'Returned',
                       'In Review',
                       'Approved',
                       'Escalated',
                       'Deferred',
                       -- D2 (migration 012): Finance paid out an Approved request. Terminal.
                       'Disbursed'
                   )),
    current_tier   INTEGER NOT NULL DEFAULT 0
                   CHECK (current_tier BETWEEN 0 AND 4),
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    claimed_by     INTEGER
                   REFERENCES users(user_id) ON DELETE SET NULL,
                   defer_reason   TEXT
);


-- claim_events
-- One row per claim/release action (pull-based claiming). Serves as the claim
-- history and as the count source for the per-approver claim cap on a request.

CREATE TABLE claim_events (
    claim_event_id SERIAL PRIMARY KEY,
    request_id     INTEGER NOT NULL
                   REFERENCES welfare_requests(request_id) ON DELETE CASCADE,
    approver_id    INTEGER NOT NULL
                   REFERENCES users(user_id) ON DELETE RESTRICT,
    action         VARCHAR(20) NOT NULL
                   CHECK (action IN ('claim', 'release', 'escalate_release')),
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- priority_predictions
-- The Random Forest model's predicted priority for a request (one per request).

CREATE TABLE priority_predictions (
    prediction_id  SERIAL PRIMARY KEY,
    request_id     INTEGER NOT NULL
                   REFERENCES welfare_requests(request_id) ON DELETE CASCADE,
    priority_level VARCHAR(10) NOT NULL
                   CHECK (priority_level IN ('Low', 'Medium', 'High')),
    explanation    JSONB,
    predicted_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_priority_predictions_request_id
    ON priority_predictions (request_id);


-- documents
-- Supporting documents uploaded with a request (metadata + file path).

CREATE TABLE public.documents (
	document_id serial4 NOT NULL,
	request_id int4 NOT NULL,
	file_path varchar(500) NULL,
	doc_type varchar(100) NULL,
	uploaded_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	file_bytes bytea NULL,
	file_name varchar(255) NULL,
	content_type varchar(100) NULL,
	CONSTRAINT documents_pkey PRIMARY KEY (document_id),
	CONSTRAINT documents_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.welfare_requests(request_id) ON DELETE CASCADE
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


-- disbursements
-- D2 (migration 012): the Finance payout of a fully approved request. One per request
-- (UNIQUE); amount copied from the request at payment time; own table because the
-- approvals CHECK allows only Approved/Rejected/Returned (same reason as Deferred).

CREATE TABLE disbursements (
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


-- account_deletion_requests
-- C2 (migration 013): a user's request to delete their account and the admin's decision.
-- Approval DEACTIVATES the user (users.is_active = false) - never a hard delete, so the
-- FR-11 audit trail survives. At most one Pending request per user (partial unique index).

CREATE TABLE account_deletion_requests (
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

CREATE UNIQUE INDEX uq_account_deletion_one_pending
    ON account_deletion_requests (user_id)
    WHERE status = 'Pending';


-- two_factor_codes
-- A2 Email 2FA (migration 009): short-lived one-time login codes. Only the BCrypt
-- hash of the 6-digit code is stored. Throwaway rows, so CASCADE with the user.

CREATE TABLE two_factor_codes (
    code_id        SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL
                   REFERENCES users(user_id) ON DELETE CASCADE,
    code_hash      TEXT NOT NULL,
    expires_at     TIMESTAMPTZ NOT NULL,
    attempts       INTEGER NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- Helpful indexes for common lookups (foreign keys used in queries/joins)

CREATE INDEX idx_requests_user       ON welfare_requests(user_id);
CREATE INDEX idx_requests_status     ON welfare_requests(status);
CREATE INDEX idx_approvals_request   ON approvals(request_id);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX idx_audit_request       ON audit_logs(request_id);
CREATE INDEX idx_two_factor_codes_user_id ON two_factor_codes(user_id);
CREATE INDEX idx_users_department ON users(department);
