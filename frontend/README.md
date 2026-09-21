# Frontend — Next.js

Web interface for Employees, Approvers (Department Supervisor, Welfare Officer, Finance Officer,
HR Manager), and the System Administrator.

## Screens
- Login
- Employee Dashboard (request tracking)
- Request Submission Form
- Approver Dashboard (priority-ranked queue, colour-coded badges)
- Request Details Page (priority, category, amount, documents, validation status, decision panel)
- Administrator Dashboard (users, roles, validation rules, audit log)

## Setup
```bash
npx create-next-app@latest .
npm install
npm run dev
```

## Environment variables
Copy `.env.example` to `.env.local` and fill in real values. Never commit `.env.local`.
