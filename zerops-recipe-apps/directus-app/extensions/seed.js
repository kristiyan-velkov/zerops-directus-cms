'use strict';
/**
 * Directus demo-data seed script
 *
 * Uses the Directus REST API via Node 22's built-in fetch — no external
 * dependencies, works in both the official Docker image and Zerops builds.
 *
 * The Directus HTTP server MUST be running before this script is called.
 * See extensions/seed-runner.sh (Zerops) or docker-compose.yml command
 * for the background-start → health-poll → seed pattern.
 *
 * Required env vars:
 *   DIRECTUS_URL    e.g. http://localhost:8055   (default)
 *   DIRECTUS_TOKEN  static admin token           (falls back to ADMIN_TOKEN)
 */

const BASE_URL = process.env.DIRECTUS_URL  || 'http://localhost:8055';
const TOKEN    = process.env.DIRECTUS_TOKEN || process.env.ADMIN_TOKEN || '';

if (!TOKEN) {
  console.error('Seed failed: DIRECTUS_TOKEN or ADMIN_TOKEN must be set.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiny Directus REST client — wraps fetch with auth + error handling
// ─────────────────────────────────────────────────────────────────────────────
async function directus(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function getItems(collection) {
  const data = await directus('GET', `/items/${collection}?limit=1&fields[]=id`);
  return data.data;
}

async function createItems(collection, items) {
  return directus('POST', `/items/${collection}`, items);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stable UUIDs — fixed so re-seeding is always idempotent
// ─────────────────────────────────────────────────────────────────────────────
const IDS = {
  cat: {
    technology: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    devops:     '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    tutorials:  '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  },
  author: {
    alex:  '550e8400-e29b-41d4-a716-446655440000',
    maria: '550e8400-e29b-41d4-a716-446655440001',
  },
  post: {
    p1: '8f14e45f-ceea-467a-a866-4e82e7b75eee',
    p2: '110e8400-e29b-41d4-a716-446655440002',
    p3: '110e8400-e29b-41d4-a716-446655440003',
    p4: '110e8400-e29b-41d4-a716-446655440004',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Seed functions
// ─────────────────────────────────────────────────────────────────────────────
async function seedCategories() {
  if ((await getItems('categories')).length > 0) {
    console.log('  categories — already seeded, skipping.');
    return;
  }
  await createItems('categories', [
    { id: IDS.cat.technology, name: 'Technology', slug: 'technology', sort: 1 },
    { id: IDS.cat.devops,     name: 'DevOps',     slug: 'devops',     sort: 2 },
    { id: IDS.cat.tutorials,  name: 'Tutorials',  slug: 'tutorials',  sort: 3 },
  ]);
  console.log('  categories — 3 rows inserted.');
}

async function seedAuthors() {
  if ((await getItems('authors')).length > 0) {
    console.log('  authors — already seeded, skipping.');
    return;
  }
  await createItems('authors', [
    {
      id:    IDS.author.alex,
      name:  'Alex Petrov',
      email: 'alex.petrov@example.com',
      bio:   'Senior backend engineer focused on cloud-native infrastructure. Writes about PostgreSQL performance, container orchestration, and developer experience on Zerops.',
      sort:  1,
    },
    {
      id:    IDS.author.maria,
      name:  'Maria Chen',
      email: 'maria.chen@example.com',
      bio:   'Full-stack developer and open-source contributor. Passionate about headless CMS architecture, API design, and making deployments reproducible.',
      sort:  2,
    },
  ]);
  console.log('  authors — 2 rows inserted.');
}

async function seedPosts() {
  if ((await getItems('posts')).length > 0) {
    console.log('  posts — already seeded, skipping.');
    return;
  }
  await createItems('posts', [
    {
      id:             IDS.post.p1,
      status:         'published',
      title:          'Getting Started with Directus on Zerops',
      slug:           'getting-started-directus-zerops',
      excerpt:        'A step-by-step guide to deploying Directus — with PostgreSQL, Valkey, and S3-compatible object storage — on Zerops in under 10 minutes.',
      content:        `## What You'll Build

This guide walks you through deploying a production-ready Directus instance on Zerops. By the end you'll have:

- Directus 11 running on Node.js 22
- PostgreSQL 16 as the primary datastore (HA in production)
- Valkey 7.2 for cache and pub/sub synchronisation across containers
- Zerops object storage for file uploads (S3-compatible)
- Mailpit for local email testing

## Architecture

\`\`\`
Browser / API clients
        ↓
  Directus (Node 22)   ← minContainers=2 in production
    ├── PostgreSQL 16  ← HA mode, 3 replicas
    ├── Valkey 7.2     ← HA mode, cache + pub/sub
    ├── Object Storage ← S3-compatible, persistent
    └── Mailpit        ← dev only, SMTP sink
\`\`\`

## One-Click Deploy

Click **Deploy to Zerops** in the README. Zerops provisions every service, generates all secrets, and runs bootstrap + schema apply automatically.`,
      category_id:    IDS.cat.tutorials,
      author_id:      IDS.author.alex,
      tags:           ['zerops', 'directus', 'deployment', 'getting-started'],
      date_published: '2024-01-15T09:00:00Z',
    },
    {
      id:             IDS.post.p2,
      status:         'published',
      title:          'Why We Chose Valkey Over Redis',
      slug:           'valkey-vs-redis',
      excerpt:        'Valkey is a fully open-source, Redis-compatible fork maintained by the Linux Foundation. Here is why it is the right choice for Zerops deployments.',
      content:        `## Background

In March 2024 Redis Ltd. changed the Redis licence from BSD to SSPL. The open-source community responded by forking Redis 7.2 into **Valkey**, now hosted under the Linux Foundation.

## Why Valkey on Zerops

- **Drop-in compatible** — same protocol, same commands, same client libraries
- **Truly open source** — BSD-3 licence, no commercial restrictions
- **Actively maintained** — backed by AWS, Google, Oracle, Ericsson and others
- **Exact version match** — Zerops runs Valkey 7.2

## Migration

If you already use \`ioredis\` or \`redis\`, no code changes are needed. Just point \`REDIS_HOST\` at the Valkey service hostname.

\`\`\`yaml
REDIS_HOST: \${cache_hostname}
REDIS_PORT: "6379"
SYNCHRONIZATION_STORE: redis   # Directus env key, works with Valkey
\`\`\``,
      category_id:    IDS.cat.technology,
      author_id:      IDS.author.maria,
      tags:           ['valkey', 'redis', 'cache', 'open-source'],
      date_published: '2024-02-03T11:30:00Z',
    },
    {
      id:             IDS.post.p3,
      status:         'published',
      title:          'Object Storage Deep Dive: S3 on Zerops',
      slug:           'object-storage-s3-zerops',
      excerpt:        'How Directus file uploads are routed to Zerops object storage, why path-style URLs matter, and how MinIO mirrors the same API locally.',
      content:        `## How It Works

Directus abstracts file storage behind a driver interface. Setting \`STORAGE_LOCATIONS=s3\` routes all uploads through the AWS S3 SDK. Zerops object storage exposes the same S3-compatible REST API — no custom code needed.

## Key Configuration

\`\`\`dotenv
STORAGE_LOCATIONS=s3
STORAGE_S3_KEY=\${storage_accessKeyId}
STORAGE_S3_SECRET=\${storage_secretAccessKey}
STORAGE_S3_BUCKET=\${storage_bucketName}
STORAGE_S3_ENDPOINT=\${storage_apiUrl}
STORAGE_S3_FORCE_PATH_STYLE=true
STORAGE_S3_ACL=public-read
\`\`\`

## Path-Style vs Virtual-Hosted-Style

By default the AWS SDK constructs URLs like \`bucket.endpoint/key\`. Custom S3 endpoints expect \`endpoint/bucket/key\`. Always set \`FORCE_PATH_STYLE=true\` with a custom endpoint.`,
      category_id:    IDS.cat.devops,
      author_id:      IDS.author.alex,
      tags:           ['s3', 'object-storage', 'minio', 'files'],
      date_published: '2024-03-10T14:00:00Z',
    },
    {
      id:             IDS.post.p4,
      status:         'draft',
      title:          'High-Availability PostgreSQL on Zerops (Coming Soon)',
      slug:           'ha-postgres-zerops',
      excerpt:        'A look at how Zerops provisions a 3-node PostgreSQL 16 cluster with automatic failover and how Directus handles reconnections.',
      content:        `## Status: Draft

This post is still being written. Check back soon.

## Topics to Cover

- HA mode vs NON_HA: when to use each
- How Zerops manages primary election and replica sync
- Connection pool settings for HA clusters
- Testing failover without data loss
- Backup strategy`,
      category_id:    IDS.cat.devops,
      author_id:      IDS.author.maria,
      tags:           ['postgresql', 'ha', 'database', 'scaling'],
      date_published: null,
    },
  ]);
  console.log('  posts — 4 rows inserted (3 published, 1 draft).');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  try {
    console.log('Seeding demo data…');
    await seedCategories();
    await seedAuthors();
    await seedPosts();
    console.log('Seed complete.');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
})();
