# Screenshot Guide

Save each screenshot to this folder (`docs/images/`) using the exact filename listed.
All images are referenced in `Implementation.md`.

---

## 01 — Zerops project dashboard

**Filename:** `01-zerops-project-dashboard.png`

**Steps:**
1. Go to [app.zerops.io](https://app.zerops.io)
2. Open the `directus-production` (or `directus-development`) project
3. Wait until all services show a green **Running** status
4. Screenshot the full project view showing all service cards (directus, db, cache, storage, mailpit in dev)

---

## 02 — Recipe import screen

**Filename:** `02-recipe-import-screen.png`

**Steps:**
1. Go to [app.zerops.io](https://app.zerops.io)
2. Click **Import project** (top right or from the projects list)
3. The YAML import editor opens
4. Screenshot the screen with the import.yaml content visible in the editor before clicking Import

---

## 03 — Pipeline progress

**Filename:** `03-pipeline-progress.png`

**Steps:**
1. In the Zerops project, click on the `directus` service
2. Click **Pipelines & CI/CD** in the left sidebar
3. Click on the most recent pipeline run
4. Screenshot the pipeline detail page showing the **Build**, **Deploy**, and **Run** stages all completed with green checkmarks and their timing

> Catch this during or immediately after a deploy — you can trigger a new pipeline from **Pipelines & CI/CD Settings → Trigger pipeline → Prefill from active deploy**

---

## 04 — Service logs — boot sequence

**Filename:** `04-service-logs-boot-sequence.png`

**Steps:**
1. In the Zerops project, click on the `directus` service
2. Click **Runtime log** in the left sidebar
3. Scroll to the start of the most recent boot
4. Screenshot the log section showing these lines in order:
   - `Database already initialized, skipping install`
   - `Snapshot applied successfully`
   - `Server started at http://0.0.0.0:8055`
   - `Seeded demo content. collection: categories count: 3`
   - `Seeded demo content. collection: authors count: 2`
   - `Seeded demo content. collection: posts count: 4`

> If the log has scrolled past, trigger a restart: service detail → **Stop** → **Start**

---

## 05 — Directus Data Studio — collections and content

**Filename:** `05-directus-studio-collections-and-content.png`

**Steps:**
1. Log in to Directus at your service subdomain URL
2. Click **Content** in the left sidebar
3. Make sure the left panel shows the three collections: `Categories`, `Authors`, `Posts`
4. Click on **Posts** so the posts list is visible on the right
5. Screenshot the full screen showing both the sidebar collections and the posts list with all 4 rows

---

## 06 — Zerops storage credentials

**Filename:** `06-zerops-storage-credentials.png`

**Steps:**
1. In the Zerops project, click on the `storage` service
2. The service detail page shows connection details
3. Screenshot the page showing the **Access Key ID**, **Secret Access Key**, and **Bucket name** fields (values can be partially visible or blurred for security)

---

## 07 — Mailpit email capture

**Filename:** `07-mailpit-email-capture.png`

> Development environment only — Mailpit is not included in production.

**Steps:**
1. In the Zerops development project, click on the `mailpit` service
2. Click the subdomain URL to open the Mailpit web UI
3. Trigger a Directus email — go to Directus Data Studio → User Directory → your admin user → **Request password reset**
4. Go back to the Mailpit UI — the email appears in the inbox
5. Click the email to open it and screenshot the full Mailpit UI with the email preview visible

---

## 08 — Zerops secret variables

**Filename:** `08-zerops-secret-variables.png`

**Steps:**
1. In the Zerops project, click on the `directus` service
2. Click **Environment Variables** in the left sidebar
3. Click the **Secret Variables** tab
4. Click the eye icon next to `ADMIN_PASSWORD` and `ADMIN_TOKEN` to reveal them
5. Screenshot the panel showing both variables with values partially visible (you can blur/crop the actual values if preferred)

---

## 09 — Directus login screen

**Filename:** `09-directus-login-screen.png`

**Steps:**
1. Open your Directus subdomain URL (shown on the `directus` service detail page in Zerops)
2. The Directus login screen loads
3. Type `admin@example.com` in the email field (leave password empty or type a few characters)
4. Screenshot the login screen with the email filled in and the Zerops subdomain URL visible in the browser address bar

---

## 10 — Directus posts list

**Filename:** `10-directus-posts-list.png`

**Steps:**
1. Log in to Directus
2. Click **Content** → **Posts**
3. Make sure all 4 demo posts are visible in the list view:
   - Getting Started with Directus on Zerops — `published`
   - Why We Chose Valkey Over Redis — `published`
   - Object Storage Deep Dive: S3 on Zerops — `published`
   - High-Availability PostgreSQL on Zerops — `draft`
4. Screenshot the full posts list showing the title and status badge for each row

---

## Tips

- Use a **full-screen** browser window for all screenshots — no browser chrome cut off
- **1280×800** or wider resolution gives the best result
- For Zerops GUI screenshots, dark mode and light mode both work — just be consistent
- You can blur or crop sensitive values (passwords, tokens, keys) before committing
