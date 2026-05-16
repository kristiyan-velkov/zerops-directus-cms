/**
 * Directus extension hook — auto-healing demo content seeder
 *
 * Loaded automatically by Directus from EXTENSIONS_PATH (./extensions by
 * default). Registered against the `server.start` action event, which fires
 * after the HTTP server is listening and the schema is fully loaded — safer
 * than `init.app.after`, where schema may not be ready (see directus#25500).
 *
 * Why a hook instead of a migration?
 *   • Auto-heal — if rows are deleted from the Data Studio, the next container
 *     restart refills them. The migration system records "done" exactly once
 *     and would not re-run.
 *   • Same speed — uses the open Knex instance Directus already maintains.
 *     No HTTP, no /auth/login, no /server/health polling. ~5 ms when tables
 *     have content (just 3 × `SELECT 1`), ~50 ms when seeding from scratch.
 *   • Plain ESM .js — Directus loads extensions as ES modules, so we can use
 *     `import`/`export` and `import.meta.url` natively (no .cjs workaround).
 *
 * Edge case NOT handled here:
 *   Deleting an entire collection through the Data Studio drops the underlying
 *   Postgres table and corrupts the schema cache (Directus issue #22674).
 *   On the next restart, `directus schema apply` silently no-ops because the
 *   cached schema still matches the snapshot. This hook detects the missing
 *   table via `knex.schema.hasTable()` and logs a clear warning, but cannot
 *   recreate the table itself — that requires `docker compose down -v` to
 *   wipe the schema cache, or a manual `directus schema apply` after the
 *   container has fully booted.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// The extension lives at <root>/extensions/directus-extension-seed-demo/index.js,
// so the data.json file is two levels up + into the data/ directory.
const DATA_PATH = resolve(__dirname, '..', '..', 'data', 'data.json');

const COLLECTIONS = ['categories', 'authors', 'posts'];

/**
 * For each column on the destination table, look up its Postgres type. JSON
 * and JSONB columns need their values pre-serialised with JSON.stringify —
 * Knex's pg driver otherwise emits Postgres array literals (e.g. `{a,b,c}`)
 * for plain JS arrays, which Postgres rejects against a json/jsonb column
 * with `invalid input syntax for type json`. Encountered on `posts.tags`.
 */
async function serialiseJsonColumns(trx, table, rows) {
  const info = await trx(table).columnInfo();
  const jsonCols = Object.entries(info)
    .filter(([, def]) => /^json/i.test(def.type) || /^jsonb?$/i.test(def.fullType ?? ''))
    .map(([name]) => name);

  if (jsonCols.length === 0) return rows;

  return rows.map((row) => {
    const out = { ...row };
    for (const col of jsonCols) {
      if (out[col] !== undefined && out[col] !== null && typeof out[col] !== 'string') {
        out[col] = JSON.stringify(out[col]);
      }
    }
    return out;
  });
}

export default ({ action }, { database, logger }) => {
  // Scope the logger so seed lines are easy to grep in the structured Pino log.
  const log = logger.child({ extension: 'seed-demo' });

  action('server.start', async () => {
    let data;
    try {
      data = JSON.parse(await readFile(DATA_PATH, 'utf8'));
    } catch (err) {
      log.error({ err, path: DATA_PATH }, 'Could not read data/data.json — skipping seed.');
      return;
    }

    try {
      await database.transaction(async (trx) => {
        for (const collection of COLLECTIONS) {
          const rows = data[collection];
          if (!Array.isArray(rows) || rows.length === 0) continue;

          // Guard against the "collection deleted via Data Studio" case. We
          // can detect the missing table cheaply, but cannot recreate it from
          // here — see the file-level comment for the recovery procedure.
          const hasTable = await trx.schema.hasTable(collection);
          if (!hasTable) {
            log.warn(
              { collection },
              'Table is missing — likely deleted via the Data Studio. Restore with `docker compose down -v && up -d`, or `directus schema apply` once the container is up.',
            );
            continue;
          }

          // Skip when the collection already has any rows. The auto-heal path
          // only refills empty tables; intentional data is never overwritten.
          const exists = await trx(collection).select(trx.raw('1')).limit(1).first();
          if (exists) {
            log.debug({ collection }, 'Already populated — skipping seed.');
            continue;
          }

          const prepared = await serialiseJsonColumns(trx, collection, rows);
          await trx(collection).insert(prepared);
          log.info({ collection, count: rows.length }, 'Seeded demo content.');
        }
      });
    } catch (err) {
      log.error({ err }, 'Seed transaction rolled back.');
    }
  });
};
