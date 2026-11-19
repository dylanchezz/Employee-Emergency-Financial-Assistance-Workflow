# Backend — ASP.NET Core

Workflow API: authentication, role-based access, rule-based validation, four-tier approval
routing, notifications, escalation, and audit logging. Calls the ML service for priority
classification and persists to PostgreSQL via Dapper/Npgsql.

## Responsibilities
- Authentication & role-based access — local accounts (BCrypt), Google OpenID Connect, optional
  email two-factor, password reset, login throttling (FR-01)
- Request submission handling and document upload (FR-02)
- Rule-based validation with recorded reason/flag (FR-03)
- Calls ml-service for priority classification and stores the returned priority and SHAP
  explanation (FR-04, FR-12)
- Prioritised, department-scoped approver queue (FR-05)
- Four-tier approval routing + decision recording (FR-06, FR-07)
- Notifications — in-system + email via SMTP (FR-08)
- Time-bound two-stage escalation (FR-09)
- Admin functions — manage users and roles, view validation rules, analytics (FR-10)
- Audit logging (FR-11)
- Finance disbursement recording, terminal `Disbursed` status (FR-13)
- Account-deletion requests with soft-delete and record retention (FR-14)
- Read-only requester-history view for approvers and admins (FR-15)

## Setup
```bash
dotnet restore
dotnet run
```

## Configuration
The backend reads configuration from `appsettings.Development.json` (gitignored) or from real
environment variables — a plain `.env` file is **not** auto-loaded. Use `.env.example` and
`appsettings.Example.json` only as templates for the keys that must be set (connection string,
JWT, email/SMTP, Google OAuth, ML service URL). Never commit real connection strings, secrets, or
SMTP credentials.

For the production configuration (Azure Container Apps environment variables and secrets), see
[`../DEPLOYMENT.md`](../DEPLOYMENT.md), section C.
