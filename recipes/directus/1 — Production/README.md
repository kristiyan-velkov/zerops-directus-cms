# Directus — Production Environment
This is a Production environment for [Directus (info + deploy)](https://app.zerops.io/recipes/directus?environment=production) recipe on [Zerops](https://zerops.io).

&nbsp;

<!-- #ZEROPS_EXTRACT_START:intro# -->
**Production** environment provides a production-ready, highly-available Directus setup. Runs 2–6 Directus containers behind a load balancer, with a highly-available PostgreSQL 16 cluster, a highly-available Valkey 7.2 cache cluster (required for multi-container session and schema-cache synchronisation), and 50 GB of S3-compatible object storage. Rate limiting is enabled by default (Valkey-backed, shared across all containers). All secrets are randomly generated at deploy time.
<!-- #ZEROPS_EXTRACT_END:intro# -->

&nbsp;

<!-- #ZEROPS_EXTRACT_START:maintenance-guide# -->

# Takeover and Maintenance Guide

&nbsp;

## First steps after deploy

1. **Retrieve your admin credentials** — Open the `directus` service in the Zerops GUI → **Environment Variables** → **Secret Variables**. Reveal `ADMIN_PASSWORD` and `ADMIN_TOKEN`.

2. **Log in to Directus** — Navigate to your subdomain URL and log in with `admin@example.com` and the generated `ADMIN_PASSWORD`. Change the admin email to a real address immediately.

3. **`PUBLIC_URL` is pre-configured** — automatically set to `${zeropsSubdomain}` (your Zerops subdomain URL) at deploy time. No manual step required. When you connect a custom domain (step 6), update `PUBLIC_URL` to the custom domain and trigger a re-deploy — this is required for OAuth flows, email magic-links, and CORS.

4. **Configure a real SMTP provider** — The production environment does not include Mailpit. Set the following environment variables on the `directus` service to enable email delivery:
   ```
   EMAIL_TRANSPORT         smtp
   EMAIL_SMTP_HOST         smtp.sendgrid.net          # your SMTP host
   EMAIL_SMTP_PORT         587
   DIRECTUS_EMAIL_FROM     no-reply@yourdomain.com
   ```
   `DIRECTUS_EMAIL_FROM` overrides the default `EMAIL_FROM` fallback (`no-reply@example.com`) set in `zerops.yaml`.

   Add `EMAIL_SMTP_USER` and `EMAIL_SMTP_PASSWORD` as **secret** environment variables for your SMTP credentials.

5. **Set up database backups** — Configure daily automated backups in the `db` service settings panel in the Zerops GUI.

6. **Connect your custom domain** — In the `directus` service, add your production domain and update `PUBLIC_URL` to the custom domain URL.

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
3. The `directus bootstrap` initCommand (wrapped in `zsc execOnce`) automatically applies new database migrations during the rolling restart.

> **Zero-downtime upgrades:** With `minContainers=2`, Zerops performs a rolling update — new containers pass the readiness check before old ones are terminated. Because every init step uses `zsc execOnce "<key>-$ZEROPS_appVersionId"`, only the first new container migrates; the rest see a no-op and start instantly.

&nbsp;

## What runs on every Production deploy

The `setup: production` in `zerops.yaml` runs two idempotent `zsc execOnce` steps before `directus start`:

1. `directus bootstrap` — creates Directus system tables and the first admin user (skips if already done)
2. `node scripts/ensure-schema.mjs` — checks if the `categories` table exists; only calls `directus schema apply --yes ./database/snapshot.yaml` on a fresh database, never on an existing one. The Directus CLI path is auto-detected at runtime.

Once `directus start` is listening, the `extensions/directus-extension-seed-demo` extension fires on `server.start`. In production the `SEED_VERSION` env var is **not set by default**, so the hook skips entirely — existing production content is never overwritten on redeploys.

> To start production with demo content, set `SEED_VERSION=1.0.0` in the Zerops GUI before the first deploy. To disable the seeder entirely, remove `extensions/directus-extension-seed-demo/` from the repository before deploying.

&nbsp;

## Scaling

**Horizontal:** Adjust `minContainers` / `maxContainers` on the `directus` service in the GUI. The Valkey HA cluster ensures all containers share state correctly at any replica count.

**Vertical:** Zerops autoscales RAM and CPU within the configured `verticalAutoscaling` bounds. Increase `maxRam` / `maxCpu` if Directus processes large file transformations or complex collection queries.

&nbsp;

## Backing up and restoring data

- **Database:** Configure daily snapshots in the `db` service settings. Restore via the Zerops GUI snapshot restore function.
- **File uploads:** Object storage is durable by design. For additional redundancy, consider setting up cross-region replication if your plan supports it.

&nbsp;

<!-- #ZEROPS_EXTRACT_END:maintenance-guide# -->

