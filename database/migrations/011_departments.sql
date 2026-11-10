-- 011_departments.sql
-- Enhancement D1 — department-scoped request routing (scope locked in Impact Log A23).
--
-- Until now users.department was free text and optional (A12), so it could not be trusted
-- for routing ("Finance" vs "finance" vs NULL). D1 makes the department a canonical, required
-- value: a Department Supervisor (tier 1) sees only their own department's requests.
--
-- 1. departments — the canonical list, admin-managed. name is UNIQUE so it can be the FK target.
-- 2. Seed it from the department names already in use, plus a catch-all "Unassigned".
-- 3. Backfill: every user without a department (NULL or blank) gets "Unassigned".
--    (Google sign-ups were created with department NULL — A27; they now land in "Unassigned"
--    and are asked to choose a real department before they can submit — the A3/C7 step.)
-- 4. FK users.department → departments(name), then NOT NULL, with DEFAULT 'Unassigned'.
--
-- Design note (build decision 1): the FK is on the existing NAME column, not a new
-- department_id. Every current query, DTO and screen already reads users.department as a
-- name, so nothing that reads it has to change. ON UPDATE CASCADE means renaming a department
-- in departments carries through to every user automatically — the usual drawback of a
-- natural-key FK. ON DELETE RESTRICT: a department that still has users can't be deleted.
--
-- Run as one transaction: if any step fails, nothing is half-applied.

BEGIN;

CREATE TABLE IF NOT EXISTS departments (
    department_id  SERIAL PRIMARY KEY,
    name           VARCHAR(100) NOT NULL UNIQUE,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Blank strings are "no department" too; normalise them before seeding.
UPDATE users SET department = NULL WHERE btrim(department) = '';

-- Seed from what's already in use, then the catch-all.
INSERT INTO departments (name)
SELECT DISTINCT department FROM users WHERE department IS NOT NULL
ON CONFLICT (name) DO NOTHING;

INSERT INTO departments (name) VALUES ('Unassigned')
ON CONFLICT (name) DO NOTHING;

-- Backfill before the constraints, so existing rows satisfy them.
UPDATE users SET department = 'Unassigned' WHERE department IS NULL;

ALTER TABLE users
    ADD CONSTRAINT users_department_fkey
        FOREIGN KEY (department) REFERENCES departments(name)
        ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE users ALTER COLUMN department SET NOT NULL;
ALTER TABLE users ALTER COLUMN department SET DEFAULT 'Unassigned';

-- Tier-1 queue and fan-out filter on the department, so index it.
CREATE INDEX IF NOT EXISTS idx_users_department ON users (department);

COMMIT;
