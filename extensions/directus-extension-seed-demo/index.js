/**
 * Directus extension hook — production-grade demo content seeder
 *
 * Loaded automatically by Directus from EXTENSIONS_PATH. Registered against
 * the `server.start` action event, which fires after the HTTP server is
 * listening and the schema is fully loaded.
 *
 * Design decisions:
 *   • seed_runs table  — run-once guarantee: each SEED_VERSION is recorded
 *     inside the same transaction as the content inserts, so a partial failure
 *     never marks the seed as complete.
 *   • Direct Knex      — no HTTP round-trips; runs inside the process that
 *     already owns the DB connection. Safe for Zerops HA (minContainers ≥ 2):
 *     PostgreSQL row-level locking prevents duplicate inserts.
 *   • S3 compensation  — if the collection transaction rolls back, files that
 *     were uploaded in this run are deleted to avoid orphaned objects.
 *   • File idempotency — keyed on filename_download, not title, because title
 *     is user-editable and would break the idempotency check after first use.
 *
 * Edge case NOT handled here:
 *   Deleting an entire collection through the Data Studio drops the underlying
 *   Postgres table and corrupts the schema cache (Directus issue #22674). This
 *   hook detects the missing table via `knex.schema.hasTable()` and logs a
 *   clear warning, but cannot recreate the table — run
 *   `directus schema apply --yes ./database/snapshot.yaml` to recover.
 */
import { createReadStream } from 'node:fs';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, '..', '..', 'data', 'data.json');
const DATA_DIR  = resolve(__dirname, '..', '..', 'data');

const COLLECTIONS = ['categories', 'authors', 'posts'];
const KNOWN_KEYS  = new Set([...COLLECTIONS, 'files', 'admin', 'dashboard']);

// Explicit allowlist of fields that may be patched on the admin user.
// Using a spread of data.admin would silently pass arbitrary fields
// (e.g. email, password) into a raw UPDATE — this prevents that.
const ADMIN_PATCHABLE_FIELDS = ['avatar', 'title', 'location', 'description', 'tags'];

const UPLOAD_MAX_ATTEMPTS  = 3;
const UPLOAD_BASE_DELAY_MS = 100;

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create the seed_runs bookkeeping table if it does not yet exist.
 * DDL is executed outside any transaction — PostgreSQL auto-commits CREATE.
 */
async function ensureSeedRunsTable(db) {
  const exists = await db.schema.hasTable('seed_runs');
  if (exists) return;
  await db.schema.createTable('seed_runs', (t) => {
    t.string('seed_version').primary().notNullable();
    t.timestamp('ran_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
  });
}

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

/**
 * Upload a local file via FilesService with retry + exponential backoff.
 *
 * Idempotency is keyed on `filename_download` (not `title`) because title is
 * user-editable; a changed title would trigger a duplicate upload on restart.
 *
 * Returns { id, isNew }:
 *   id    — directus_files UUID (null if the file was not found on disk)
 *   isNew — true only when this call performed the actual upload, so the
 *           caller can track newly uploaded IDs for S3 compensation.
 */
async function seedFile(fileDef, { FilesService, database, schema, logger: log }) {
  const { path: relPath, title, type = 'image/webp', description, tags } = fileDef;
  const filePath = resolve(DATA_DIR, relPath);
  const filename = relPath.split('/').pop();

  // Skip gracefully when the binary is absent (e.g. not committed to git).
  try {
    await access(filePath);
  } catch {
    log.warn({ filename }, 'Upload file not found on disk — skipping image seed.');
    return { id: null, isNew: false };
  }

  // Idempotency check — keyed on filename_download, not title.
  const existing = await database('directus_files')
    .select('id')
    .where({ filename_download: filename })
    .first();
  if (existing) {
    log.debug({ filename, id: existing.id }, 'File already uploaded — reusing existing ID.');
    return { id: existing.id, isNew: false };
  }

  const filesService    = new FilesService({ knex: database, schema });
  const storageLocation = (process.env.STORAGE_LOCATIONS ?? 'local').split(',')[0].trim();

  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const stream = createReadStream(filePath);
      const id = await filesService.uploadOne(stream, {
        title,
        filename_download: filename,
        type,
        storage: storageLocation,
        ...(description != null && { description }),
        // tags is a JSONB column — must be a JSON string, not a plain array.
        ...(tags != null && { tags: JSON.stringify(tags) }),
      });
      log.info({ filename, id, attempt }, 'Seeded demo file.');
      return { id, isNew: true };
    } catch (err) {
      if (attempt === UPLOAD_MAX_ATTEMPTS) throw err;
      const delay = UPLOAD_BASE_DELAY_MS * 2 ** (attempt - 1); // 100 → 200 → throw
      log.warn({ filename, attempt, delay, err: err.message }, 'File upload failed — retrying.');
      await sleep(delay);
    }
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export default ({ action }, { database, logger, services, getSchema }) => {
  const log = logger.child({ extension: 'seed-demo' });

  action('server.start', async () => {

    // ── 0. Seed version guard ────────────────────────────────────────────
    // SEED_VERSION must be set explicitly. If absent the operator has not
    // opted in to seeding — skip rather than seed blindly.
    const seedVersion = process.env.SEED_VERSION;
    if (!seedVersion) {
      log.warn('SEED_VERSION env var is not set — skipping seed. Set it to a non-empty string to enable seeding.');
      return;
    }

    // ── 1. Run-once fast-path ────────────────────────────────────────────
    // Non-atomic SELECT — just avoids opening a transaction on warm restarts
    // where the seed has already completed. The real race safety is the
    // atomic INSERT inside the transaction below (step 5).
    await ensureSeedRunsTable(database);
    const alreadyRan = await database('seed_runs').where({ seed_version: seedVersion }).first();
    if (alreadyRan) {
      log.info({ seedVersion }, 'Seed version already ran — skipping.');
      return;
    }

    // ── 2. Read + validate data.json ──────────────────────────────────────
    // Throw (not return) so the process exits non-zero and the Zerops
    // readiness check fails visibly instead of starting with no content.
    let data;
    try {
      data = JSON.parse(await readFile(DATA_PATH, 'utf8'));
    } catch (err) {
      throw new Error(`Seed failed: could not read ${DATA_PATH} — ${err.message}`);
    }

    // Warn about unrecognised keys so stale data.json sections are visible.
    for (const key of Object.keys(data)) {
      if (!KNOWN_KEYS.has(key)) {
        log.warn({ key }, 'data.json contains unknown key — it will be ignored. Add it to COLLECTIONS or the known-keys allowlist.');
      }
    }

    // ── 3. Seed files ─────────────────────────────────────────────────────
    // Files must be uploaded before content rows that reference them.
    // Track newly uploaded IDs separately for S3 compensation on failure.
    const fileIds    = {};   // key → UUID (all files, new + pre-existing)
    const newFileIds = [];   // UUIDs uploaded in this run — compensation targets

    if (Array.isArray(data.files) && data.files.length > 0) {
      let schema;
      try {
        schema = await getSchema();
      } catch (err) {
        throw new Error(`Seed failed: could not load Directus schema — ${err.message}`);
      }

      for (const fileDef of data.files) {
        const { id, isNew } = await seedFile(fileDef, {
          FilesService: services.FilesService,
          database,
          schema,
          logger: log,
        });
        fileIds[fileDef.key] = id;
        if (isNew && id) newFileIds.push(id);
      }
    }

    // ── 4. Seed admin profile ─────────────────────────────────────────────
    // UPDATE (not INSERT) — patch only when avatar is still null so user
    // edits made in the Data Studio are never overwritten on restart.
    // Only fields in ADMIN_PATCHABLE_FIELDS are written; all others ignored.
    if (data.admin) {
      try {
        const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
        const adminUser  = await database('directus_users')
          .select('id', 'avatar')
          .where({ email: adminEmail })
          .first();

        if (adminUser && !adminUser.avatar) {
          const patch = {};
          for (const field of ADMIN_PATCHABLE_FIELDS) {
            if (!(field in data.admin)) continue;
            const value = data.admin[field];
            if (field === 'avatar') {
              if (value && fileIds[value]) patch.avatar = fileIds[value];
            } else if (field === 'tags') {
              if (Array.isArray(value)) patch.tags = JSON.stringify(value);
            } else {
              patch[field] = value;
            }
          }
          if (Object.keys(patch).length > 0) {
            await database('directus_users').where({ id: adminUser.id }).update(patch);
            log.info({ email: adminEmail }, 'Seeded admin user profile.');
          }
        } else if (adminUser?.avatar) {
          log.debug({ email: process.env.ADMIN_EMAIL }, 'Admin profile already set — skipping.');
        } else {
          log.warn({ email: process.env.ADMIN_EMAIL }, 'Admin user not found — skipping profile seed.');
        }
      } catch (err) {
        log.error({ err }, 'Admin profile seed failed.');
      }
    }

    // ── 5. Seed collections + record completion (one transaction) ─────────
    // seed_runs is INSERT-ed as the VERY FIRST statement in the transaction
    // using ON CONFLICT DO NOTHING. This is the atomic distributed lock:
    // whichever container wins the INSERT owns the seed; the other detects
    // the empty RETURNING result and exits cleanly — no window between check
    // and act, no duplicate seeding, no race condition.
    //
    // If any collection table is missing (schema apply not yet complete),
    // we THROW — rolling back the entire transaction including the seed_runs
    // claim. The version is NOT recorded, so the next container restart
    // retries from scratch instead of silently completing with empty tables.
    //
    // Idempotency is keyed on the SEED ROW IDs (fixed UUIDs in data.json),
    // not on whether the collection has any data at all. This matters because:
    //   • A collection can have user-added rows AND still be missing seed rows.
    //   • Bumping SEED_VERSION after manually deleting seed content correctly
    //     re-inserts only what is missing without touching user data.
    //   • The old bulk `exists` check would claim the version immediately and
    //     skip all inserts when ANY row existed — silently consuming the version
    //     with 0 actual inserts. If the user then deleted all content, the next
    //     restart fast-pathed on the already-claimed version, leaving collections
    //     permanently empty until the version was bumped again.
    try {
      await database.transaction(async (trx) => {

        // Atomic distributed lock — whoever inserts first wins the seed.
        // ON CONFLICT DO NOTHING returns 0 rows when another container
        // already inserted this version; `claimed` will be undefined.
        const [claimed] = await trx('seed_runs')
          .insert({ seed_version: seedVersion, ran_at: trx.fn.now() })
          .onConflict('seed_version')
          .ignore()
          .returning('seed_version');

        if (!claimed) {
          log.info({ seedVersion }, 'Another container claimed this seed version — skipping.');
          return;
        }

        for (const collection of COLLECTIONS) {
          const rows = data[collection];
          if (!Array.isArray(rows) || rows.length === 0) continue;

          const hasTable = await trx.schema.hasTable(collection);
          if (!hasTable) {
            // Throw rolls back the entire transaction, including the
            // seed_runs claim above. The version is NOT recorded so the
            // next restart retries rather than marking the seed "done"
            // with empty collections.
            throw new Error(
              `Collection table '${collection}' not found — schema apply may not have completed yet. ` +
              `Rolling back seed_runs claim; will retry on next restart.`,
            );
          }

          // Check which seed rows (by their fixed UUIDs) are already present.
          // This is intentionally narrower than "does the collection have any rows":
          //   • User-added rows with different IDs do not suppress seeding.
          //   • Accidentally deleted seed rows are detected and re-inserted.
          //   • All seed rows present → genuinely nothing to do → safe to skip.
          const seedIds = rows.map((r) => r.id);
          const existingIds = new Set(
            await trx(collection).whereIn('id', seedIds).pluck('id'),
          );
          const missing = rows.filter((r) => !existingIds.has(r.id));

          if (missing.length === 0) {
            log.debug({ collection, count: rows.length }, 'All seed rows present — skipping.');
            continue;
          }

          // Resolve file key strings (e.g. "cover-directus") → actual UUIDs
          // for only the rows that need to be inserted.
          const resolved = missing.map((row) => {
            const out = { ...row };
            for (const [field, value] of Object.entries(out)) {
              if (typeof value === 'string' && value in fileIds) {
                out[field] = fileIds[value];
              }
            }
            return out;
          });

          const prepared = await serialiseJsonColumns(trx, collection, resolved);
          await trx(collection).insert(prepared);
          log.info({ collection, inserted: missing.length, total: rows.length }, 'Seeded demo content.');
        }

        // ── 5b. Seed Insights dashboard ─────────────────────────────────
        // directus_dashboards and directus_panels are system tables that
        // always exist after bootstrap. A dashboard seeded here appears in
        // Insights immediately — no manual creation needed.
        if (data.dashboard) {
          const dash = data.dashboard;
          const dashExists = await trx('directus_dashboards').where({ id: dash.id }).first();
          if (!dashExists) {
            // Attribute the dashboard to the admin user when resolvable.
            const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
            const adminUser  = await trx('directus_users').select('id').where({ email: adminEmail }).first();
            const userId     = adminUser?.id ?? null;

            await trx('directus_dashboards').insert({
              id:           dash.id,
              name:         dash.name,
              icon:         dash.icon  ?? 'space_dashboard',
              note:         dash.note  ?? null,
              color:        dash.color ?? null,
              date_created: trx.fn.now(),
              user_created: userId,
            });

            const panels = (dash.panels ?? []).map((p) => ({
              id:          p.id,
              dashboard:   dash.id,
              name:        p.name        ?? null,
              icon:        p.icon        ?? null,
              color:       p.color       ?? null,
              show_header: p.show_header ?? false,
              note:        p.note        ?? null,
              type:        p.type,
              position_x:  p.position_x,
              position_y:  p.position_y,
              width:       p.width,
              height:      p.height,
              // options is a JSONB column — must be a JSON string, not a plain object.
              options:      p.options != null ? JSON.stringify(p.options) : null,
              date_created: trx.fn.now(),
              user_created: userId,
            }));

            if (panels.length > 0) {
              await trx('directus_panels').insert(panels);
            }

            log.info({ name: dash.name, panelCount: panels.length }, 'Seeded Insights dashboard.');
          } else {
            log.debug({ name: dash.name }, 'Dashboard already exists — skipping.');
          }
        }

        log.info({ seedVersion }, 'Seed complete — version claimed and all content inserted.');
      });
    } catch (err) {
      log.error({ err }, 'Seed transaction rolled back — seed_version NOT recorded.');

      // Compensate: delete files uploaded in this run to avoid orphaned S3 objects.
      if (newFileIds.length > 0) {
        log.warn({ count: newFileIds.length }, 'Attempting S3 compensation — deleting files uploaded this run.');
        try {
          const schema = await getSchema();
          const filesService = new services.FilesService({ knex: database, schema });
          await filesService.deleteMany(newFileIds);
          log.info({ count: newFileIds.length }, 'S3 compensation complete.');
        } catch (compErr) {
          log.error({ compErr }, 'S3 compensation failed — orphaned files may remain in storage. Delete them manually.');
        }
      }
    }
  });
};
