import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const dataDir = resolve(root, 'data');
export const uploadDir = resolve(dataDir, 'uploads');
const stateFile = resolve(dataDir, 'state.json');
const schemaFile = resolve(root, 'sql', 'schema.sql');
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let initialized;
let writes = Promise.resolve();

function date(value) { return value ? new Date(value).toISOString() : null; }
function emptyState() { return { products: [], regions: [], runs: [] }; }

async function ensureSchema() {
  if (!pool) return;
  initialized ??= (async () => {
    const statements = readFileSync(schemaFile, 'utf8').split(';').map(sql => sql.trim()).filter(Boolean);
    for (const statement of statements) await pool.query(statement);
  })();
  await initialized;
}

async function loadPostgresState() {
  const [productRows, regionRows, groupRows, imageRows, variantRows, variantImageRows, runRows, runImageRows, runGroupRows] = await Promise.all([
    pool.query('SELECT * FROM products ORDER BY created_at, id'),
    pool.query('SELECT * FROM regions ORDER BY name, id'),
    pool.query('SELECT * FROM groups ORDER BY region_id, position'),
    pool.query('SELECT product_id, image_name FROM product_images ORDER BY product_id, position'),
    pool.query('SELECT product_id, region_id, caption FROM product_region_content'),
    pool.query('SELECT product_id, region_id, image_name FROM product_region_images ORDER BY product_id, region_id, position'),
    pool.query('SELECT * FROM posting_runs ORDER BY started_at DESC, id DESC'),
    pool.query('SELECT run_id, image_name FROM posting_run_images ORDER BY run_id, position'),
    pool.query('SELECT * FROM posting_run_groups ORDER BY run_id, position')
  ]);
  const state = emptyState();
  const products = new Map();
  const regions = new Map();
  const runs = new Map();
  for (const row of productRows.rows) {
    const product = { id: row.id, name: row.name, caption: row.caption, images: [], variants: {}, createdAt: date(row.created_at) };
    state.products.push(product); products.set(row.id, product);
  }
  for (const row of regionRows.rows) {
    const region = { id: row.id, name: row.name, groups: [] };
    state.regions.push(region); regions.set(row.id, region);
  }
  for (const row of groupRows.rows) regions.get(row.region_id)?.groups.push({ id: row.id, name: row.name, url: row.url });
  for (const row of imageRows.rows) products.get(row.product_id)?.images.push(row.image_name);
  for (const row of variantRows.rows) {
    const product = products.get(row.product_id);
    if (product) product.variants[row.region_id] = { caption: row.caption, images: [] };
  }
  for (const row of variantImageRows.rows) products.get(row.product_id)?.variants[row.region_id]?.images.push(row.image_name);
  for (const row of runRows.rows) {
    const run = {
      id: row.id, productId: row.product_id, regionId: row.region_id,
      productName: row.product_name, regionName: row.region_name,
      caption: row.caption, images: [], dryRun: row.dry_run,
      status: row.status, startedAt: date(row.started_at), finishedAt: date(row.finished_at),
      nextAt: date(row.next_at), items: []
    };
    if (row.error) run.error = row.error;
    state.runs.push(run); runs.set(row.id, run);
  }
  for (const row of runImageRows.rows) runs.get(row.run_id)?.images.push(row.image_name);
  for (const row of runGroupRows.rows) {
    const item = {
      groupId: row.group_id, groupName: row.group_name, url: row.url,
      status: row.status, startedAt: date(row.started_at), finishedAt: date(row.finished_at)
    };
    if (row.message) item.message = row.message;
    runs.get(row.run_id)?.items.push(item);
  }
  return state;
}

async function savePostgresState(snapshot) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const table of ['posting_run_groups', 'posting_run_images', 'product_region_images', 'product_region_content', 'product_images']) {
      await client.query(`DELETE FROM ${table}`);
    }
    const regionIds = snapshot.regions.map(region => region.id);
    const productIds = snapshot.products.map(product => product.id);
    const groupIds = snapshot.regions.flatMap(region => region.groups.map(group => group.id));
    for (const region of snapshot.regions) {
      await client.query('INSERT INTO regions (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name', [region.id, region.name]);
    }
    for (const product of snapshot.products) {
      await client.query('INSERT INTO products (id, name, caption, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, caption = EXCLUDED.caption', [product.id, product.name, product.caption, product.createdAt ?? new Date().toISOString()]);
    }
    await client.query('DELETE FROM groups WHERE NOT (id = ANY($1::uuid[]))', [groupIds]);
    for (const region of snapshot.regions) {
      for (const [position, group] of region.groups.entries()) {
        await client.query('INSERT INTO groups (id, region_id, name, url, position) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET region_id = EXCLUDED.region_id, name = EXCLUDED.name, url = EXCLUDED.url, position = EXCLUDED.position', [group.id, region.id, group.name, group.url, position]);
      }
    }
    await client.query('DELETE FROM products WHERE NOT (id = ANY($1::uuid[]))', [productIds]);
    await client.query('DELETE FROM regions WHERE NOT (id = ANY($1::uuid[]))', [regionIds]);
    for (const product of snapshot.products) {
      for (const [position, name] of product.images.entries()) {
        await client.query('INSERT INTO product_images (product_id, image_name, position) VALUES ($1, $2, $3)', [product.id, name, position]);
      }
      for (const [regionId, variant] of Object.entries(product.variants ?? {})) {
        if (!regionIds.includes(regionId)) continue;
        await client.query('INSERT INTO product_region_content (product_id, region_id, caption) VALUES ($1, $2, $3)', [product.id, regionId, variant.caption ?? '']);
        for (const [position, name] of (variant.images ?? []).entries()) {
          await client.query('INSERT INTO product_region_images (product_id, region_id, image_name, position) VALUES ($1, $2, $3, $4)', [product.id, regionId, name, position]);
        }
      }
    }
    for (const run of snapshot.runs) {
      await client.query(`INSERT INTO posting_runs (id, product_id, region_id, product_name, region_name, caption, dry_run, status, started_at, finished_at, next_at, error)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (id) DO UPDATE SET product_id=EXCLUDED.product_id, region_id=EXCLUDED.region_id, status=EXCLUDED.status,
          finished_at=EXCLUDED.finished_at, next_at=EXCLUDED.next_at, error=EXCLUDED.error`, [
        run.id, productIds.includes(run.productId) ? run.productId : null, regionIds.includes(run.regionId) ? run.regionId : null,
        run.productName, run.regionName, run.caption, run.dryRun === true, run.status,
        run.startedAt, run.finishedAt ?? null, run.nextAt ?? null, run.error ?? null
      ]);
      for (const [position, name] of (run.images ?? []).entries()) {
        await client.query('INSERT INTO posting_run_images (run_id, image_name, position) VALUES ($1, $2, $3)', [run.id, name, position]);
      }
      for (const [position, item] of run.items.entries()) {
        await client.query('INSERT INTO posting_run_groups (run_id, position, group_id, group_name, url, status, message, started_at, finished_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
          run.id, position, groupIds.includes(item.groupId) ? item.groupId : null,
          item.groupName, item.url, item.status, item.message ?? null, item.startedAt ?? null, item.finishedAt ?? null
        ]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function loadState() {
  if (pool) {
    await ensureSchema();
    const count = await pool.query('SELECT (SELECT count(*) FROM products) + (SELECT count(*) FROM regions) + (SELECT count(*) FROM posting_runs) AS total');
    if (Number(count.rows[0].total) === 0) {
      const old = await pool.query('SELECT body FROM app_state WHERE id = 1');
      const legacy = old.rows[0]?.body;
      if (legacy && ((legacy.products?.length ?? 0) || (legacy.regions?.length ?? 0) || (legacy.runs?.length ?? 0))) {
        await saveState({ products: legacy.products ?? [], regions: legacy.regions ?? [], runs: legacy.runs ?? [] });
      }
    }
    return loadPostgresState();
  }
  mkdirSync(uploadDir, { recursive: true });
  if (!existsSync(stateFile)) return emptyState();
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  return { products: state.products ?? [], regions: state.regions ?? [], runs: state.runs ?? [] };
}

export function saveState(state) {
  const snapshot = JSON.parse(JSON.stringify(state));
  if (pool) {
    writes = writes.catch(() => {}).then(async () => { await ensureSchema(); await savePostgresState(snapshot); });
    return writes;
  }
  mkdirSync(dataDir, { recursive: true });
  const tmp = `${stateFile}.tmp`;
  writeFileSync(tmp, JSON.stringify(snapshot), { mode: 0o600 });
  renameSync(tmp, stateFile);
  return Promise.resolve();
}

export async function saveMedia(name, mime, body) {
  if (pool) { await ensureSchema(); await pool.query('INSERT INTO images (name, mime, body) VALUES ($1, $2, $3)', [name, mime, body]); }
  else { mkdirSync(uploadDir, { recursive: true }); writeFileSync(resolve(uploadDir, name), body); }
}

export async function readMedia(name) {
  if (pool) {
    await ensureSchema();
    const result = await pool.query('SELECT mime, body FROM images WHERE name = $1', [name]);
    return result.rows[0] ?? null;
  }
  const path = resolve(uploadDir, name);
  if (!existsSync(path)) return null;
  const mime = /\.mp4$/i.test(name) ? 'video/mp4' : /\.mov$/i.test(name) ? 'video/quicktime' : /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : /\.gif$/i.test(name) ? 'image/gif' : /\.heic$/i.test(name) ? 'image/heic' : 'image/jpeg';
  return { mime, body: readFileSync(path) };
}

export async function mediaBuffer(name) {
  const media = await readMedia(name);
  if (!media) throw new Error(`Không tìm thấy tệp ${name}`);
  return media.body;
}
