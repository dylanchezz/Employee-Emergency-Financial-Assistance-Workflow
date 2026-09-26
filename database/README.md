Database

PostgreSQL schema for the Employee Emergency Financial Assistance Workflow.

Database name: emergency_assistance_db

The schema is defined in schema.sql and implements the logical database schema documented in Chapter 4. It contains eight tables: users, welfare_requests, priority_predictions, documents, approvals, notifications, escalations, and audit_logs.

Design notes
Single users table. All actors (Employee and the approver/admin roles) are stored in users, distinguished by the role column. This matches the class model, where Employee is a specialisation of User implemented via single-table inheritance.
VARCHAR + CHECK constraints enforce the allowed values for role, status, priority, category, channel, and decision fields — readable and self-documenting.
Foreign keys link every child record to its welfare_request (and users where relevant), enforcing referential integrity. Request-owned records use ON DELETE CASCADE; user references use RESTRICT (or SET NULL for audit actor) to preserve accountability.
approvals.reason records the justification for a rejected or returned request.
priority_predictions.request_id is UNIQUE — one prediction per request.
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

You should see the eight tables listed.

Note on re-running

schema.sql begins with DROP TABLE IF EXISTS ... CASCADE for each table, so it can be re-run cleanly during development (it recreates the schema from scratch). This drops all data — remove or guard those DROP statements before any real deployment.