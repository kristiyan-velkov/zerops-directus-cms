# Directus — Development Environment
This is a development environment for [Directus (info + deploy)](https://app.zerops.io/recipes/directus?environment=development) recipe on [Zerops](https://zerops.io).

&nbsp;

<!-- #ZEROPS_EXTRACT_START:intro# -->
**Development** environment provides a low-resource Directus setup suitable for building and testing. Includes a full stack: Node.js 22, PostgreSQL 16, Valkey 7.2 cache, S3-compatible object storage, and **Mailpit** for SMTP email capture — so all outbound emails are intercepted locally with zero risk of sending real messages.
<!-- #ZEROPS_EXTRACT_END:intro# -->

&nbsp;

<!-- #ZEROPS_EXTRACT_START:maintenance-guide# -->

# Takeover and Maintenance Guide

&nbsp;

## First steps after deploy

1. **Retrieve your admin credentials** — Open the `directus` service in the Zerops GUI → **Environment Variables** → **Secret Variables**. Reveal `ADMIN_PASSWORD` and `ADMIN_TOKEN`.

2. **Log in to Directus** — Navigate to your subdomain URL (shown on the service detail page). Log in with `admin@example.com` and your generated `ADMIN_PASSWORD`.

3. **Inspect test emails** — Open the `mailpit` service subdomain (Mailpit web UI) to see any emails Directus sent during bootstrap (e.g. password-reset flows you trigger during testing).

4. **Set PUBLIC_URL** — Once you have your subdomain URL, set it as the `PUBLIC_URL` environment variable on the `directus` service and trigger a re-deploy. This is required for OAuth flows and email links to work correctly.

&nbsp;

## Upgrading Directus

> [!NOTE]
> Directus releases: https://github.com/directus/directus/releases

1. In your fork of [zerops-directus-cms](https://github.com/kristiyan-velkov/zerops-directus-cms), update `package.json`:
   ```json
   "directus": "11.x.x"
   ```
2. Push the change, or trigger a re-deploy from the Zerops GUI:  
   **Pipelines & CI/CD Settings** → **Trigger a new pipeline** → **Prefill from active deploy**.
3. The `directus bootstrap` initCommand (wrapped in `zsc execOnce`) automatically applies any new database migrations.

&nbsp;

## What runs on every Development deploy

The single `setup: directus` in `zerops.yaml` runs two idempotent `zsc execOnce` steps before `directus start`:

1. `directus bootstrap` — system tables + first admin user
2. `directus schema apply --yes ./database/snapshot.yaml` — `categories`, `authors`, `posts` collections

Once `directus start` is listening, the `extensions/directus-extension-seed-demo` extension fires on `server.start` and inserts the demo content (3 categories, 2 authors, 4 posts) via Knex-direct `INSERT` — but **only when the target tables are empty**. This makes the seeder *auto-healing*: delete a row in the Data Studio, restart the container, and the row comes back.

> If a *whole collection* is deleted from the Data Studio, restart alone won't restore it — Directus has a known schema-cache bug ([directus#22674](https://github.com/directus/directus/issues/22674)) where `schema apply` silently no-ops after a UI-driven collection delete. The fix is `docker compose down -v && docker compose up -d` (locally) or redeploy the service (on Zerops).

&nbsp;

<!-- #ZEROPS_EXTRACT_END:maintenance-guide# -->

