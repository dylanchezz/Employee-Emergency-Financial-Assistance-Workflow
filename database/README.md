Database

PostgreSQL schema for the Employee Emergency Financial Assistance Workflow.

Database name: emergency_assistance_db

The schema is defined in schema.sql and implements the logical database schema documented in Chapter 4. It contains fourteen tables: departments, users, welfare_requests, claim_events, priority_predictions, documents, approvals, notifications, escalations, audit_logs, and two_factor_codes (added by migration 009 for Email 2FA, along with users.two_factor_enabled). departments (migration 011, D1) is the canonical department list; users.department is a required FK to departments(name), with "Unassigned" as the catch-all. disbursements (migration 012, D2) records the Finance payout of a fully approved request (one per request); welfare_requests.status gained the terminal value 'Disbursed'. account_deletion_requests (migration 013, C2) records account-deletion requests and decisions; approval soft-deletes the user (users.is_active = false, deactivated_at) and never removes the row, so history is preserved. users.last_seen_at (migration 014, Phase 6 F3) records the user's last authenticated activity (throttled to about once a minute) for the admin's "active in the last 5 minutes" count. Phase 7: users.failed_login_count and users.locked_until (migration 015, A1 login throttling) and the password_reset_tokens table (migration 016, A4 forgot password — only a SHA-256 hash of each single-use token is stored). Phase 8: migration 017 seeds ten corporate departments (Operations, Commercial, Finance, Information Technology, Human Resources, Legal, Risk & Compliance, Cargo, Quality, Safety & Environment, Strategy & Innovation, Technical) - data only, idempotent, still fourteen tables.

Design notes
Single users table. All actors (Employee and the approver/admin roles) are stored in users, distinguished by the role column. This matches the class model, where Employee is a specialisation of User implemented via single-table inheritance.
VARCHAR + CHECK constraints enforce the allowed values for role, status, priority, category, channel, and decision fields — readable and self-documenting.
Foreign keys link every child record to its welfare_request (and users where relevant), enforcing referential integrity. Request-owned records use ON DELETE CASCADE; user references use RESTRICT (or SET NULL for audit actor) to preserve accountability.
approvals.reason records the justification for a rejected or returned request.
priority_predictions.request_id is NOT unique — a request can hold several predictions (one per resubmit; migration 008 dropped the original UNIQUE so the priority history is kept). The application reads the latest by predicted_at.
Prerequisites
PostgreSQL installed and running (this project targets PostgreSQL 18).
psql available on your PATH, or use DBeaver.
Create the database and load the schema
Option 1 — command line (psql)
bash
# 1. Create the database (run once)
createdb -U postgres emergency_assistance_db

# 2. Load the schema
psql -U postgres -d emergency_assistance_db -f database/schema.sql

If createdb is not convenient, you can instead create the database from inside psql:

bash
psql -U postgres
sql
CREATE DATABASE emergency_assistance_db;
\c emergency_assistance_db
\i database/schema.sql
Option 2 — DBeaver (GUI)
Connect to your local PostgreSQL server (host localhost, port 5432, user postgres).
Create a new database named emergency_assistance_db.
Open schema.sql as an SQL script against that database and execute it.
Verify

After loading, confirm the tables exist:

bash
psql -U postgres -d emergency_assistance_db -c "\dt"

You should see the fourteen tables listed.

Note on re-running

schema.sql begins with DROP TABLE IF EXISTS ... CASCADE for each table, so it can be re-run cleanly during development (it recreates the schema from scratch). This drops all data — remove or guard those DROP statements before any real deployment.