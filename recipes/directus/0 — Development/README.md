# Directus — Development Environment
This is a development environment for [Directus (info + deploy)](https://app.zerops.io/recipes/directus?environment=development) recipe on [Zerops](https://zerops.io).

&nbsp;

<!-- #ZEROPS_EXTRACT_START:intro# -->
**Development** environment provides a low-resource Directus setup suitable for building and testing. Includes a full stack: Node.js 22, PostgreSQL 16, Valkey 7.2 cache, S3-compatible object storage, and **Mailpit** for SMTP email capture — so all outbound emails are intercepted locally with zero risk of sending real messages.
<!-- #ZEROPS_EXTRACT_END:intro# -->

&nbsp;

# Takeover and Maintenance Guide

&nbsp;

## First steps after deploy

1. **Retrieve your admin credentials** — Open the `directus` service in the Zerops GUI → **Environment Variables** → **Secret Variables**. Reveal `ADMIN_PASSWORD` and `ADMIN_TOKEN`.

2. **Log in to Directus** — Navigate to your subdomain URL (shown on the service detail page). Log in with `admin@example.com` and your generated `ADMIN_PASSWORD`.

3. **Inspect test emails** — Open the `mail` service subdomain (Mailpit web UI) to see any emails Directus sent during bootstrap (e.g. password-reset flows you trigger during testing).

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
3. The `directus bootstrap` initCommand automatically applies any new database migrations.

&nbsp;
