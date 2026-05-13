# Directus — Production Environment
This is a Production environment for [Directus (info + deploy)](https://app.zerops.io/recipes/directus?environment=production) recipe on [Zerops](https://zerops.io).

&nbsp;

<!-- #ZEROPS_EXTRACT_START:intro# -->
**Production** environment provides a production-ready, highly-available Directus setup. Runs 2–6 Directus containers behind a load balancer, with a highly-available PostgreSQL 16 cluster, a highly-available Valkey 7.2 cache cluster (required for multi-container session and schema-cache synchronisation), and 50 GB of S3-compatible object storage. All secrets are randomly generated at deploy time.
<!-- #ZEROPS_EXTRACT_END:intro# -->

&nbsp;

# Takeover and Maintenance Guide

&nbsp;

## First steps after deploy

1. **Retrieve your admin credentials** — Open the `directus` service in the Zerops GUI → **Environment Variables** → **Secret Variables**. Reveal `ADMIN_PASSWORD` and `ADMIN_TOKEN`.

2. **Log in to Directus** — Navigate to your subdomain URL and log in with `admin@example.com` and the generated `ADMIN_PASSWORD`. Change the admin email to a real address immediately.

3. **Set PUBLIC_URL** — Copy the `directus` subdomain URL from the service detail page and set it as the `PUBLIC_URL` environment variable. Trigger a re-deploy to apply. This is required for OAuth flows, email magic-links, and CORS to work correctly.

4. **Configure a real SMTP provider** — The production environment does not include Mailpit. Set the following environment variables on the `directus` service to enable email delivery:
   ```
   DIRECTUS_SMTP_HOST      smtp.sendgrid.net          # your SMTP host
   DIRECTUS_SMTP_PORT      587
   DIRECTUS_EMAIL_FROM     no-reply@yourdomain.com
   ```
   Add `EMAIL_SMTP_USER` and `EMAIL_SMTP_PASSWORD` as **secret** environment variables for your SMTP credentials.

5. **Set up database backups** — Configure daily automated backups in the `db` service settings panel in the Zerops GUI.

6. **Connect your custom domain** — In the `directus` service, add your production domain and update `PUBLIC_URL` accordingly.

&nbsp;

## Upgrading Directus

> [!NOTE]
> Directus releases: https://github.com/directus/directus/releases

1. In your fork of [directus-app](https://github.com/zerops-recipe-apps/directus-app), update `package.json`:
   ```json
   "directus": "11.x.x"
   ```
2. Push the change, or trigger a re-deploy from the Zerops GUI:  
   **Pipelines & CI/CD Settings** → **Trigger a new pipeline** → **Prefill from active deploy**.
3. The `directus bootstrap` initCommand automatically applies new database migrations during the rolling restart.

> **Zero-downtime upgrades:** With `minContainers=2`, Zerops performs a rolling update — new containers pass the readiness check before old ones are terminated.

&nbsp;

## Scaling

**Horizontal:** Adjust `minContainers` / `maxContainers` on the `directus` service in the GUI. The Valkey HA cluster ensures all containers share state correctly at any replica count.

**Vertical:** Zerops autoscales RAM and CPU within the configured `verticalAutoscaling` bounds. Increase `maxRam` / `maxCpu` if Directus processes large file transformations or complex collection queries.

&nbsp;

## Backing up and restoring data

- **Database:** Configure daily snapshots in the `db` service settings. Restore via the Zerops GUI snapshot restore function.
- **File uploads:** Object storage is durable by design. For additional redundancy, consider setting up cross-region replication if your plan supports it.

&nbsp;
