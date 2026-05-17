/**
 * Conditional schema apply — safe to run on every container start.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `directus schema apply --yes` is destructive: when run against a database
 * that already has the custom collections (categories, authors, posts) with
 * data, it drops and re-creates those tables — wiping all rows. Running it on
 * every restart or deploy therefore deletes all content every time.
 *
 * This script checks the database first: if the `categories` table already
 * exists, schema apply is skipped entirely. Schema apply only runs on a truly
 * fresh (just-bootstrapped) database.
 *
 * HOW IT IS CALLED
 * ─────────────────
 * Zerops  → initCommand:
 *             zsc execOnce "schema-cms-v1" -- node scripts/ensure-schema.mjs
 *           The fixed execOnce key is a second layer of protection in HA mode:
 *           only one container per project ever runs this script at deployment
 *           time, and the DB check inside makes it safe even if the lock were
 *           lost.
 *
 * Docker  → startup command:
 *             node /directus/scripts/ensure-schema.mjs
 *           The database itself is the single source of truth — no marker
 *           files, no external locks, no schema apply hanging on Redis.
 *
 * HOW TO UPDATE THE SCHEMA
 * ─────────────────────────
 * 1. Edit database/snapshot.yaml with the new collections / fields.
 * 2. In zerops.yaml, change the execOnce key to "schema-cms-v2" (increment).
 *    The hasTable guard ensures schema apply only runs on a fresh database
 *    — it will never destroy data on an already-populated instance.
 * 3. Commit and push.
 *
 * NOTE: SEED_VERSION is separate from the schema version. Bumping SEED_VERSION
 * re-runs the seed hook (inserts missing demo content) but does NOT trigger
 * schema apply.
 */

import { createRequire } from 'node:module';
import { execSync }      from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync }   from 'node:fs';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// createRequire lets us use CJS require() inside an ESM module.
// We anchor it to this script's own URL so that absolute-path requires
// are passed through unchanged — no module resolution, no ambiguity.
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Load the pg Client — handles two different node_modules layouts:
//
//   npm flat layout  (Zerops: npm ci → node_modules/pg/)
//   pnpm virtual store (official directus/directus Docker image:
//                        node_modules/.pnpm/pg@<version>/node_modules/pg/)
//
// Using require(absolutePath) bypasses Node.js's bare-specifier resolution
// so it works regardless of which directory this script lives in.
// ---------------------------------------------------------------------------
let Client;

const flatPgPath = join(projectRoot, 'node_modules', 'pg');

try {
  // Zerops (npm ci produces a flat node_modules — pg is directly accessible)
  ({ Client } = require(flatPgPath));
} catch {
  // Docker official image uses pnpm with a virtual store. Walk the .pnpm dir
  // to find whichever pg version is installed without hard-coding the version.
  try {
    const pnpmDir = join(projectRoot, 'node_modules', '.pnpm');
    const pgEntry = readdirSync(pnpmDir).find((d) => /^pg@\d/.test(d));
    if (!pgEntry) throw new Error('No pg@x entry found in pnpm virtual store');
    ({ Client } = require(join(pnpmDir, pgEntry, 'node_modules', 'pg')));
  } catch (resolveErr) {
    console.error('[schema] Could not load the pg package:', resolveErr.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// DB check + conditional schema apply
// ---------------------------------------------------------------------------

const client = new Client({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_DATABASE,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

try {
  await client.connect();

  // Use 'categories' as the sentinel: it is always the first collection
  // created by the snapshot. If it exists, the full schema was already applied.
  const { rows } = await client.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name   = 'categories'
      LIMIT 1`,
  );

  if (rows.length > 0) {
    console.log('[schema] Custom schema already present — skipping schema apply.');
    process.exit(0);
  }

  console.log('[schema] Fresh database detected — applying schema snapshot…');

  try {
    execSync(
      `node_modules/.bin/directus schema apply --yes ./database/snapshot.yaml`,
      { stdio: 'inherit', env: process.env, cwd: projectRoot },
    );
  } catch (err) {
    throw new Error(`schema apply exited with code ${err.status ?? '?'}`);
  }

  console.log('[schema] Schema snapshot applied successfully.');

} catch (err) {
  console.error('[schema] Fatal:', err.message);
  process.exit(1);

} finally {
  await client.end().catch(() => {});
}
