# Employee Emergency Assistance Workflow

A centralized web-based workflow system for managing employee emergency financial assistance
requests in corporate organizations. The system integrates a supervised multi-class **Random
Forest** classification model to predict request urgency as **Low**, **Medium**, or **High**
Priority, supporting urgency-based queue ranking, visual priority flagging, and faster escalation
within a structured four-tier approval workflow. Every prediction is accompanied by a
human-interpretable **SHAP** explanation, and final decisions always rest with human approvers.

**Live:** https://employee-emergency-assistance-workflow.vercel.app

## Problem

Many organizations still rely on fragmented spreadsheet tracking, sequential email approvals, and
manual verification to process employee emergency financial assistance requests. Requests are
typically handled first-in, first-out, with no mechanism to prioritize urgent cases — meaning an
employee facing a medical emergency may wait as long as one with a routine request.

## What this system does

- Employees submit emergency financial assistance requests with supporting documents.
- Requests are validated against organizational policy: an annual request limit and duplicate
  detection block or return a request, while an unusually large amount (over 1.5× salary) or a
  short employment duration flag it for approver review without blocking it.
- A trained Random Forest model classifies each validated request as **Low / Medium / High**
  priority — informing queue order only, never making the final decision — and attaches a SHAP
  explanation of the factors behind the prediction.
- Requests are routed through a **four-tier human approval workflow**: Department Supervisor →
  Welfare Officer → Finance Officer → Human Resource Manager, after which the Finance Officer
  records disbursement.
- Notifications, time-bound two-stage escalation, and full audit logging run throughout the
  request lifecycle.
- Additional features: email two-factor authentication, Google sign-in, password reset, account
  deletion with record retention, and a read-only requester-history view for approvers and admins.

The model's output **never** approves, rejects, or bypasses a stage — final decisions always rest
with human approvers.

## Repository structure

```
.
├── frontend/       # Next.js web application (employee, approver, admin UIs)
├── backend/        # ASP.NET Core workflow API (auth, validation, routing, escalation)
├── ml-service/     # FastAPI + scikit-learn Random Forest priority classification service
├── database/       # PostgreSQL schema.sql and ordered migration scripts
├── docs/           # Project documentation, diagrams, Gantt chart, chapter drafts
├── DEPLOYMENT.md   # Full deployment and update guide (Vercel + Azure Container Apps + Neon)
└── README.md
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, Tailwind CSS |
| Backend / workflow | ASP.NET Core (.NET 9), Dapper, Npgsql |
| Model service | FastAPI, scikit-learn, SHAP, Joblib |
| Database | PostgreSQL 18 |
| Auth | JWT, BCrypt, Google OpenID Connect, email 2FA |
| Notifications | SMTP (MailKit / Brevo) |
| ML data tooling | Python, Faker, NumPy, Pandas |

## Getting started

Local setup for each component is in its own README:
- [`frontend/README.md`](./frontend/README.md)
- [`backend/README.md`](./backend/README.md)
- [`ml-service/README.md`](./ml-service/README.md)
- [`database/README.md`](./database/README.md)

To deploy the system (Vercel + Azure Container Apps + Neon), see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Branching strategy

- `main` — stable, always working.
- `feature/<name>` — one branch per development sprint/module, merged via pull request.

See [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) for the sprint/commit convention used
throughout this project.

## Status

Deployed and running as a hosted web application; see the live URL above and
[`DEPLOYMENT.md`](./DEPLOYMENT.md). See [`docs/`](./docs) for the full project documentation.
