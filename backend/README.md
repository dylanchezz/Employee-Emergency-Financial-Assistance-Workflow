# Backend — ASP.NET Core

Workflow API: authentication, role-based access, rule-based validation, four-tier approval
routing, notifications, escalation, and audit logging. Calls the ML service for priority
classification and persists to PostgreSQL.

## Responsibilities
- Authentication & role-based access (FR-01)
- Request submission handling (FR-02)
- Rule-based validation with recorded reason (FR-03)
- Calls ml-service for priority classification (FR-04)
- Prioritised approver queue (FR-05)
- Four-tier approval routing + decision recording (FR-06, FR-07)
- Notifications — in-system + email via SMTP (FR-08)
- Time-bound escalation (FR-09)
- Admin functions — users, roles, validation rules (FR-10)
- Audit logging (FR-11)

## Setup
```bash
dotnet new webapi -o .
dotnet restore
dotnet run
```

## Environment variables
Copy `.env.example` to `.env` (or configure via `appsettings.Development.json`, which is
gitignored). Never commit real connection strings or SMTP credentials.
