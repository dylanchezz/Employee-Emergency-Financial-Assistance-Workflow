-- 017_seed_departments.sql
-- Phase 8 - seed a realistic corporate department set so the demo reads as a real org.
-- Idempotent: ON CONFLICT (name) DO NOTHING, so re-running is safe and existing rows
-- (including 'Unassigned' from 011 and any already in use) are untouched.
-- These are EMPLOYEE org units, distinct from the approver roles (HR Manager etc.).
--
-- No code change is needed: GET /api/departments reads this table, and the self-service picker
-- and the admin dropdown already bind to it. users.department is an FK onto departments(name)
-- (migration 011), so nothing else references these rows until a user is assigned to one.
--
-- One transaction; additive only.

BEGIN;

INSERT INTO departments (name) VALUES
  ('Operations'),
  ('Commercial'),
  ('Finance'),
  ('Information Technology'),
  ('Human Resources'),
  ('Legal, Risk & Compliance'),
  ('Cargo'),
  ('Quality, Safety & Environment'),
  ('Strategy & Innovation'),
  ('Technical')
ON CONFLICT (name) DO NOTHING;

COMMIT;
