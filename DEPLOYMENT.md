# Deployment Guide — Employee Welfare Portal

This guide deploys the system as:

| Part | Hosting | Source |
|---|---|---|
| Database (PostgreSQL) | **Neon** (managed, free tier, persistent) | `database/schema.sql` |
| Backend API (.NET 9) | **Azure Container Apps**, public, port 8080 | `backend/Dockerfile` |
| Priority model service (FastAPI + SHAP) | **Azure Container Apps**, public (see C4), port 8000 | `ml-service/Dockerfile` |
| Frontend (Next.js) | **Vercel** | `frontend/` |

```
Browser ──▶ Vercel (Next.js) ──HTTPS──▶ Container App "welfare-api" ──▶ Neon PostgreSQL
                                              │
                                              └──HTTPS──▶ Container App "welfare-ml" (public — see C4)
```

Deploying adds no new application behaviour. The only code change for deployment is that the backend's
CORS origins are now configurable (`Cors:AllowedOrigins`). Locally they still default to `http://localhost:3000`.

The commands below are written for **Git Bash** (the shell used throughout this project). Replace every
`<...>` placeholder with your own value.

---

## A. Prerequisites

- **Azure for Students** subscription, active at <https://portal.azure.com>.
- **Azure CLI**, installed from <https://aka.ms/installazurecliwindows>; check it with `az --version`.
- **Docker Desktop**, which builds the images on your PC before they are pushed to Azure. Azure for Students doesn't allow `az acr build`.
- **Neon** account at <https://neon.tech>.
- **Vercel** account at <https://vercel.com>, signed in with the GitHub account that owns the repository.
- The **Google Cloud OAuth client** already used for "Continue with Google", from Google Cloud console →
  APIs & Services → Credentials.
- A **Brevo** SMTP login and key, the same ones used locally.
- `psql`, which comes with your local PostgreSQL 18 install.

> **Secrets rule:** real secrets go into the Azure / Vercel settings and nowhere else. Never put them in a
> committed file. See section G.

---

## B. Database → Neon

1. In Neon, **Create project**:
   - Name: `employee-welfare-portal`
   - Postgres version: the newest offered
   - Region: the one closest to the Azure region you will use in section C
2. On the project dashboard, open **Connect**:
   - Pick the default branch and database (`neondb`).
   - Copy the **connection string**. It looks like
     `postgresql://neondb_owner:<password>@ep-xxxx-xxxx.<region>.aws.neon.tech/neondb?sslmode=require`.
3. Apply the schema (you apply database changes yourself, as always).
   - `database/schema.sql` is the **consolidated full build**. It already contains everything migrations 001 → 017
     add: the fourteen tables, all columns and constraints, and the seeded departments.
   - Run it once against the **new, empty** Neon database:

   ```bash
   psql "postgresql://neondb_owner:<password>@ep-xxxx.<region>.aws.neon.tech/neondb?sslmode=require" \
        -f database/schema.sql
   ```

   - Do **not** also run the files in `database/migrations/`. They upgrade an *older* database to this
     schema, and `schema.sql` already includes them.
   - ⚠️ `schema.sql` starts with `DROP TABLE IF EXISTS ...`, so never run it again once the live
     database holds real data.
4. Check the result:

   ```bash
   psql "<neon connection string>" -c "\dt"                          # 14 tables
   psql "<neon connection string>" -c "SELECT name FROM departments;" # Unassigned + 10 departments
   ```

5. **Convert the connection string for the backend.** Npgsql (the backend's driver) expects
   keyword format, not a `postgresql://` URL. Build it from the parts of the Neon string:

   ```
   Host=ep-xxxx-xxxx.<region>.aws.neon.tech;Port=5432;Database=neondb;Username=neondb_owner;Password=<password>;SSL Mode=Require
   ```

   This is the value of `ConnectionStrings__Default` in section C.

> On the free tier, Neon suspends the database after a few idle minutes. The first query after that takes about
> a second longer while it wakes. Nothing is lost.

---

## C. Backend + model images → Azure Container Apps

### C1. Sign in and set names

```bash
az login
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
az provider register --namespace Microsoft.ContainerRegistry

RG=welfare-rg
LOC=switzerlandnorth        # this subscription only allows: switzerlandnorth, austriaeast, italynorth,
                            # spaincentral, uaenorth  (see: az policy assignment list)
ACR=welfareportal<initials><digits>   # registry name: lowercase letters/digits only, globally unique
ENV=welfare-env
```

### C2. Resource group, container registry, Container Apps environment

```bash
az group create --name $RG --location $LOC
az acr create --resource-group $RG --name $ACR --location $LOC --sku Basic --admin-enabled true
az containerapp env create --resource-group $RG --name $ENV --location $LOC
```

### C3. Build the images locally and push them to the registry

> `az acr build` (cloud builds, "ACR Tasks") is **not permitted on Azure for Students** — it fails with
> `TasksOperationsNotAllowed`. So the images are built on your PC with Docker Desktop and pushed.

Docker Desktop must be running. From the **repository root** (each image is built from its own folder, so the
`.dockerignore` next to each Dockerfile applies):

```bash
az acr login --name $ACR                                   # → Login Succeeded

docker build -t $ACR.azurecr.io/welfare-backend:v1 ./backend
docker push  $ACR.azurecr.io/welfare-backend:v1

docker build -t $ACR.azurecr.io/welfare-ml:v1 ./ml-service  # add --no-cache to see the training log again
docker push  $ACR.azurecr.io/welfare-ml:v1                 # ~1.4 GB upload

az acr repository list --name $ACR -o table                # → welfare-backend, welfare-ml
```

The model image regenerates the synthetic dataset and retrains the Random Forest during the build
(`generate_data.py` → `train.py`, fixed seed 42) — the trained model is never committed. The build log prints the
held-out metrics (accuracy 0.8530, macro F1 0.8511 — identical to the local `evaluation/metrics.txt`); keep it as
evidence that the deployed model is the documented one.

**Optional — run an image locally first:** `docker run --rm -p 8000:8000 $ACR.azurecr.io/welfare-ml:v1`, then open
<http://localhost:8000/docs>.

### C4. The model service

```bash
ACR_PASS=$(az acr credential show --name $ACR --query "passwords[0].value" -o tsv)

az containerapp create --resource-group $RG --name welfare-ml --environment $ENV   --image $ACR.azurecr.io/welfare-ml:v1   --registry-server $ACR.azurecr.io --registry-username $ACR --registry-password "$ACR_PASS"   --ingress external --target-port 8000   --cpu 0.5 --memory 1.0Gi --min-replicas 1 --max-replicas 1

ML_URL=https://$(az containerapp show -g $RG -n welfare-ml --query properties.configuration.ingress.fqdn -o tsv)
echo $ML_URL     # https://welfare-ml.<env-domain>.azurecontainerapps.io
curl -s $ML_URL/health    # {"status":"ok"}
```

- **`--min-replicas 1`:** the backend gives the model 5 seconds to answer, so it must never be cold-starting.

> **Why external ingress (a deliberate deviation from the design).** The intended setup was *internal* ingress, so
> only the backend could reach the model. On this Azure for Students subscription the Container Apps environment
> is an **Express** environment, which does not route internal traffic. This was verified from inside the backend
> container on 19/11/2026:
> - the app name `welfare-ml` does not resolve, so `http://welfare-ml` cannot connect;
> - the internal app's address resolves to Azure's public front door, which answers **404**.
>
> Every prediction failed, and requests were saved as *Unclassified*.
>
> The model service is therefore **publicly reachable**. The risk is low: it holds no data and no secrets, and it
> only scores the numbers sent to it. On a standard (non-Express) environment, use `--ingress internal` and the
> `.internal.` address instead.
>
> Symptom to recognise: the backend log shows `Model service returned 404 … request will be unclassified.`

### C5. The backend API (public)

1. **Choose your frontend URL now.** On Vercel, a project named `employee-welfare-portal` is served at
   `https://employee-welfare-portal.vercel.app`, provided that name is free. If you end up with a different URL,
   update the two variables in step C6.

2. **Generate a JWT signing secret:**

   ```bash
   openssl rand -base64 48
   ```

   It must be at least 32 characters. Use a new one for production, not the one in your Development config.

3. **Enter the secrets without echoing them.** This keeps them out of your shell history:

   ```bash
   read -rsp "Neon connection string (keyword format): " DB_CONN; echo
   read -rsp "JWT secret: " JWT_SECRET; echo
   read -rsp "Brevo SMTP key: " SMTP_KEY; echo
   read -rsp "Google client secret: " GOOGLE_SECRET; echo

   FRONTEND_URL=https://<your-project>.vercel.app
   ```

4. **Create the container app:**

   ```bash
   az containerapp create --resource-group $RG --name welfare-api --environment $ENV \
     --image $ACR.azurecr.io/welfare-backend:v1 \
     --registry-server $ACR.azurecr.io --registry-username $ACR --registry-password "$ACR_PASS" \
     --ingress external --target-port 8080 \
     --cpu 0.5 --memory 1.0Gi --min-replicas 1 --max-replicas 1 \
     --secrets db-conn="$DB_CONN" jwt-secret="$JWT_SECRET" smtp-key="$SMTP_KEY" google-secret="$GOOGLE_SECRET" \
     --env-vars \
       ConnectionStrings__Default=secretref:db-conn \
       Jwt__Secret=secretref:jwt-secret \
       Jwt__Issuer=<issuer> \
       Jwt__Audience=<audience> \
       Jwt__ExpiryMinutes=120 \
       Email__Enabled=true \
       Email__SmtpHost=smtp-relay.brevo.com \
       Email__SmtpPort=587 \
       Email__SmtpUser=<your-login@smtp-brevo.com> \
       Email__SmtpKey=secretref:smtp-key \
       "Email__FromName=Employee Welfare Portal" \
       Email__FromAddress=<verified-sender-address> \
       GoogleAuth__ClientId=<client-id>.apps.googleusercontent.com \
       GoogleAuth__ClientSecret=secretref:google-secret \
       MlService__BaseUrl=$ML_URL \
       FrontendBaseUrl=$FRONTEND_URL \
       Cors__AllowedOrigins__0=$FRONTEND_URL

   API_URL=https://$(az containerapp show -g $RG -n welfare-api --query properties.configuration.ingress.fqdn -o tsv)
   echo $API_URL
   ```

**How the settings work:**
- **Environment variable names:** each one mirrors a config section, with `__` standing for `:`. They were
  checked against `Program.cs` and `appsettings.Example.json`:

  | Setting | Notes |
  |---|---|
  | `ConnectionStrings__Default` | The connection-string key is `Default`, **not** `DefaultConnection`. |
  | `Jwt__Secret`, `Jwt__Issuer`, `Jwt__Audience`, `Jwt__ExpiryMinutes` | The section is `Jwt`. |
  | `Email__*` | `SmtpHost`, `SmtpPort`, `SmtpUser`, `SmtpKey`, `FromName`, `FromAddress`, `Enabled` |
  | `GoogleAuth__ClientId`, `GoogleAuth__ClientSecret` | |
  | `MlService__BaseUrl` | |
  | `FrontendBaseUrl` | Used to build the links in password-reset emails. |
  | `Cors__AllowedOrigins__0` | Add `__1`, `__2`, … for more origins. |

- **Secrets:** `--secrets` stores each value encrypted in the container app. `secretref:` makes the
  environment variable read from that stored secret, so the value never appears in the app's settings view.
- **`--min-replicas 1`:** the API never cold-starts.
- **`--max-replicas 1`:** the escalation worker and the login throttle's in-memory counter assume a single
  instance.
- **The container runs as `Production`:** Swagger is disabled, and no `appsettings.Development.json` exists
  inside the image (it is excluded by `.dockerignore`).

### C6. Changing a setting later

Use this, for example, if the Vercel URL turns out to be different:

```bash
az containerapp update -g $RG -n welfare-api \
  --set-env-vars FrontendBaseUrl=https://<real>.vercel.app Cors__AllowedOrigins__0=https://<real>.vercel.app
```

To change a secret:

```bash
az containerapp secret set -g $RG -n welfare-api --secrets jwt-secret="<new>"
az containerapp revision restart -g $RG -n welfare-api --revision <name>
```

You can also edit everything in the portal: the container app → **Settings → Containers / Secrets**.

### C7. Shipping a new version

See **section H** (updating after deployment).

---

## D. Frontend → Vercel

Two equivalent ways: the **dashboard** (D1) or the **Vercel CLI** (D2, what was used for this deployment).
Either way the settings are the same:

| Setting | Value |
|---|---|
| Project name | `employee-emergency-assistance-workflow` (sets the `*.vercel.app` URL — see the note below) |
| Root Directory | `frontend` |
| Framework | Next.js (auto-detected) — leave build settings at their defaults |
| Production branch | `main` |
| `NEXT_PUBLIC_API_BASE_URL` | `https://<backend-app-fqdn>/api`, i.e. `$API_URL/api` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `<client-id>.apps.googleusercontent.com` |

- These are the only two variables the frontend reads (see `frontend/.env.example`). The client ID is public by
  design; the client secret lives only in the backend. Set both for **Production** and **Preview**.
- `NEXT_PUBLIC_*` values are baked in **at build time** — after changing one, redeploy (Deployments → ⋯ → Redeploy).

### D1. Dashboard

Vercel → **Add New → Project** → import the GitHub repository → set the values above → **Deploy**.

### D2. CLI

```bash
npm i -g vercel
vercel login                                   # device code: open the link, enter the code, Approve

P=employee-emergency-assistance-workflow
vercel project create $P
vercel project update $P --root-directory frontend --framework nextjs
vercel link --yes --project $P                 # run from the REPO ROOT; creates .vercel/ (git-ignored)

vercel env add NEXT_PUBLIC_API_BASE_URL production --value "$API_URL/api" --no-sensitive --yes
vercel env add NEXT_PUBLIC_GOOGLE_CLIENT_ID production --value "<client-id>.apps.googleusercontent.com" --no-sensitive --yes
# (repeat both with `preview` instead of `production`)

vercel deploy --prod --yes
```

- **`.vercelignore`** (repo root) makes a CLI deploy upload **only `frontend/`** — never the backend's
  `appsettings.Development.json`, `Leftovers/`, or the Python venv.
- `vercel link` may append a blanket `.env*` line to `.gitignore`; remove it (it would also ignore the
  `.env.example` templates — the existing `.env` / `.env.*` + `!.env.example` rules already cover local env files).

### D3. Connect GitHub (automatic deploys)

1. Vercel account → **Settings → Authentication → Login Connections → Connect GitHub**.
2. Install the Vercel GitHub app on the repository: <https://github.com/apps/vercel/installations/new> →
   *Only select repositories* → this repo.
3. Connect and set the production branch:

   ```bash
   vercel git connect https://github.com/<owner>/<repo> --yes
   vercel project update employee-emergency-assistance-workflow --git-branch main
   ```

From then on every merge to `main` deploys to production and every PR gets a preview URL.

### Note — the production URL gets shortened

Vercel shortens long project names in the auto-generated domain: this project was first served at
`https://employee-emergency-assistance-workf.vercel.app`. The full name was attached as an extra domain so it
matches the backend's CORS / `FrontendBaseUrl` and Google's authorized origin:

```bash
vercel domains add employee-emergency-assistance-workflow.vercel.app employee-emergency-assistance-workflow
```

**Use the full URL** — `https://employee-emergency-assistance-workflow.vercel.app`. The short one serves the same
site, but its API calls are blocked by CORS. (Alternatively allow both: `Cors__AllowedOrigins__1`, see C6.)

---

## E. Google OAuth

In Google Cloud console → APIs & Services → **Credentials** → your OAuth 2.0 Client ID:

- **Authorized JavaScript origins:** add `https://<your-project>.vercel.app`. Keep `http://localhost:3000`
  for local development.
- **Authorized redirect URIs:** nothing to add. The app uses Google's **popup authorization-code flow**:
  - The code is delivered to the page itself.
  - The backend exchanges it with the fixed `redirect_uri = "postmessage"` (`backend/Auth/GoogleAuthService.cs`).
  - So there is no backend callback URL to register.
- **OAuth consent screen:** if it is still in *Testing*, only the listed **test users** can sign in with Google.
  Add the accounts you will demo with, or publish the app.

Changes can take a few minutes to take effect.

---

## F. Verify — health checks and one end-to-end run

### F1. Health checks

```bash
curl -s $API_URL/                   # → Employee Welfare Portal API is running
curl -s $API_URL/api/health/db      # → {"status":"ok","database":"connected","result":1}
```

**The model service** (see C4 for why it is public):
- Check it from its logs:

  ```bash
  az containerapp logs show -g $RG -n welfare-ml --tail 20
  ```

  You should see `Uvicorn running on http://0.0.0.0:8000`. The end-to-end test below proves the backend reaches it.
- Open `https://<welfare-ml-fqdn>/docs` and call `GET /health`. The response is
  `{"status":"ok"}`.

### F2. Create the first administrator

The live database starts with **no users**:
1. Sign up on the live site with your own email.
2. Promote that account (the database is yours to change):

   ```bash
   psql "<neon connection string>" \
     -c "UPDATE users SET role = 'System Administrator' WHERE email = '<your-email>';"
   ```

3. Sign out and sign back in, so the new role is in your token.
4. Create the approver accounts from **Admin → Users**: Department Supervisor, Welfare Officer, HR Manager and
   Finance Officer.
5. Give the employee account a department. Requests can't be submitted from "Unassigned".

### F3. End-to-end task

Run this on the live site:
1. **Sign in** as an employee.
2. **Submit** a request. Attach a document.
3. **Classify:** the request shows a model priority (High/Medium/Low) with its "Why this priority?" SHAP
   factors. This proves backend → model works.
4. **Approve:** sign in as each approver in turn and approve.
5. **Disburse:** as Finance, record the disbursement.
6. **Check notifications:** they appear in the bell and, with `Email__Enabled=true`, arrive by email.

### F4. Evidence for the report (§5.2.3 / §5.6)

Record:
- The **live URL**, e.g. `https://<project>.vercel.app`, and the API URL.
- A **health-check response**: a screenshot of `/api/health/db` returning `connected`.
- The **configuration** with secrets redacted: the Container Apps *Containers → Environment variables* view
  (`secretref:` values show no secret) and the Vercel *Environment Variables* page.
- The **release**: the final commit hash, and a tag created after merging to `main`:

  ```bash
  git tag v1.0.0 && git push origin v1.0.0
  ```

  Record which image tags were live at the release, so the tag and the deployed images match. For
  `v1.0.0` these are `welfare-backend:v3` and `welfare-ml:v2` (v3/v2 add the per-factor `urgency`
  direction to the SHAP explanation and restore the 18-hour escalation window; backend v2 added
  requester history), with the frontend at the merge of PR #82 (`bfb4d71`). Check the live tags with
  `az containerapp show -g $RG -n welfare-api --query "properties.template.containers[0].image" -o tsv`
  (and the same for `welfare-ml`).
- The model image **build log** from C3, with the held-out metrics.

---

## G. Secrets

**Rules:**
- **Never commit real secrets.** Their only homes are:
  - **Azure:** the container app's *Secrets* (`--secrets`, referenced through `secretref:`). These hold the Neon
    connection string, the JWT secret, the Brevo SMTP key and the Google client secret.
  - **Vercel:** *Environment Variables*. These hold only the API URL and the public Google client ID.
- **The templates stay templates:** `backend/appsettings.Example.json` and `frontend/.env.example`.
  - Real local values stay in the git-ignored `backend/appsettings.Development.json` and `frontend/.env.local`.
  - `.dockerignore` keeps the git-ignored files out of the images as well.
- **The trained model and the generated CSV are not committed.** The model image regenerates both at build time.

**If a secret ever leaks:**
1. Rotate it at the source:
   - **Neon:** reset the role's password.
   - **JWT:** generate a new secret. This signs everyone out.
   - **Brevo:** create a new SMTP key.
   - **Google:** add a new client secret.
2. Update the container app secret (section C6).

**Cost note:** `--min-replicas 1` on both apps means they are billed continuously. When there is no traffic
they bill at the lower idle rate. This draws on the Azure for Students credit. Check **Cost Management** after
the first day.

To stop all Azure charges after marking, delete the resource group (this deletes everything in it):

```bash
az group delete --name $RG
```

---

## H. Updating after deployment (code changes)

The parts of the system do **not** all update the same way:

| Part | Updates automatically? | What to do |
|---|---|---|
| Frontend (Vercel) | ✅ Yes — on every push/merge to `main` | Nothing. Vercel rebuilds and redeploys in ~1–2 min (and builds a *preview* URL for every PR branch). |
| Backend (Azure) | ❌ No | Rebuild the image with a new tag and point the app at it (H2). |
| Model service (Azure) | ❌ No | Same as the backend, only when `ml-service/` changed (H2). |
| Database (Neon) | ❌ No | Run the new migration file against Neon yourself (H1). |

### H0. Open a terminal with the names set

The `$RG` / `$ACR` variables from C1 don't survive closing Git Bash. In a new terminal, from the repository root:

```bash
az login                      # if your session expired
RG=welfare-rg
ACR=<your-registry-name>      # the same name you used in C1
```

### H1. Database change (only if you added a migration)

```bash
psql "<neon connection string>" -f database/migrations/0NN_<name>.sql
```

Apply only the **new** migration(s), never `schema.sql` (it drops every table). Keep `schema.sql` updated in
the repo as usual so a fresh build still matches.

### H2. Backend and/or model change

After the change is merged to `main` and you have pulled it locally (`git switch main && git pull`). Use a **new
tag every time** (`v2`, `v3`, … — check the last one with
`az acr repository show-tags --name $ACR --repository welfare-backend -o table`):

```bash
az acr login --name $ACR          # Docker Desktop running

# backend changed
docker build -t $ACR.azurecr.io/welfare-backend:v2 ./backend
docker push  $ACR.azurecr.io/welfare-backend:v2
az containerapp update -g $RG -n welfare-api --image $ACR.azurecr.io/welfare-backend:v2

# ml-service changed
docker build -t $ACR.azurecr.io/welfare-ml:v2 ./ml-service
docker push  $ACR.azurecr.io/welfare-ml:v2
az containerapp update -g $RG -n welfare-ml --image $ACR.azurecr.io/welfare-ml:v2
```

Container Apps starts the new version alongside the old one and switches traffic once it is up — no downtime.
Then re-run the health check (`curl -s $API_URL/api/health/db`).

**Roll back** if the new version misbehaves — point the app at the previous tag:

```bash
az containerapp update -g $RG -n welfare-api --image $ACR.azurecr.io/welfare-backend:v1
```

### H3. Frontend change

Nothing to run — merging to `main` deploys it. Watch it on Vercel → **Deployments**. To roll back, open an earlier
deployment → ⋯ → **Promote to Production**.

### H4. Order when one change touches several parts

1. **Migration** on Neon (H1) — the database must be ready first.
2. **Backend** (H2) — new code now finds the columns it expects.
3. **Frontend** — merge to `main` *after* the backend is live, if the frontend calls something new in the backend.

A setting change (new environment variable, rotated secret) needs no rebuild — see C6.
