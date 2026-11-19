# Frontend — Next.js

The web interface for the Employee Emergency Assistance Workflow: employee, approver, and admin
UIs. Built with Next.js and Tailwind CSS, it talks to the ASP.NET Core backend over REST.

## Prerequisites

- Node.js (LTS) and npm
- The backend API running (locally or deployed) — see [`../backend/README.md`](../backend/README.md)

## Environment variables

Copy `.env.example` to `.env.local` and set the two values the app reads:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of the backend API, e.g. `http://localhost:5264/api` locally, or `https://<backend-fqdn>/api` in production. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client ID for "Continue with Google" (public by design; the client secret stays in the backend). |

`NEXT_PUBLIC_*` values are baked in at build time — after changing one, rebuild/redeploy.

## Run the development server

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app expects the backend to be reachable
at `NEXT_PUBLIC_API_BASE_URL`.

## Build for production

```bash
npm run build
npm run start
```

## Deployment

The frontend is deployed on Vercel (root directory `frontend/`, production branch `main`, auto-deploy
on merge). Full instructions are in [`../DEPLOYMENT.md`](../DEPLOYMENT.md), section D.
