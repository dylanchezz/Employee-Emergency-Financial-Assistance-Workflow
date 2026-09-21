# Employee Emergency Assistance Workflow

A centralized web-based workflow system for managing employee emergency financial assistance
requests in corporate organizations. The system integrates a supervised multi-class **Random
Forest** classification model to predict request urgency as **Low**, **Medium**, or **High**
Priority, supporting urgency-based queue ranking, visual priority flagging, and faster escalation
within a structured four-tier approval workflow.

> Final year Capstone Project — BSc. Informatics and Computer Science, Strathmore University.
> Author: Saisi Dylan Musalia (158490) · Supervisor: Mr. Emmanuel Olang'

## Problem

Many organizations still rely on fragmented spreadsheet tracking, sequential email approvals, and
manual verification to process employee emergency financial assistance requests. Requests are
typically handled first-in, first-out, with no mechanism to prioritize urgent cases — meaning an
employee facing a medical emergency may wait as long as one with a routine request.

## What this system does

- Employees submit emergency financial assistance requests with supporting documents.
- Requests are automatically validated against organizational policy (eligibility, duplicate
  detection, amount limits, document completeness).
- A trained Random Forest model classifies each validated request as **Low / Medium / High**
  priority — informing queue order only, never making the final decision.
- Requests are routed through a **four-tier human approval workflow**: Department Supervisor →
  Welfare Officer → Finance Officer → Human Resource Manager.
- Notifications, time-bound escalation, and full audit logging run throughout the request
  lifecycle.

The model's output **never** approves, rejects, or bypasses a stage — final decisions always rest
with human approvers.

## Repository structure

```
.
├── frontend/       # Next.js web application (employee, approver, admin UIs)
├── backend/        # ASP.NET Core workflow API (auth, validation, routing, escalation)
├── ml-service/     # FastAPI + scikit-learn Random Forest priority classification service
├── docs/           # Project documentation, diagrams, Gantt chart, chapter drafts
└── README.md
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js |
| Backend / workflow | ASP.NET Core |
| Model service | FastAPI, scikit-learn, Joblib |
| Database | PostgreSQL |
| Notifications | SMTP |
| ML data tooling | Python, Faker, NumPy, Pandas |

## Getting started

See each component's own README for setup instructions:
- [`frontend/README.md`](./frontend/README.md)
- [`backend/README.md`](./backend/README.md)
- [`ml-service/README.md`](./ml-service/README.md)

## Branching strategy

- `main` — stable, always working.
- `feature/<name>` — one branch per development sprint/module, merged via pull request.

See [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) for the sprint/commit convention used
throughout this project.

## Status

🚧 In active development. See [`docs/`](./docs) for the current project documentation.
