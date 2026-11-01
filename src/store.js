import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const dataDir = resolve(root, 'data');
export const uploadDir = resolve(dataDir, 'uploads');
const stateFile = resolve(dataDir, 'state.json');
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let writes = Promise.resolve();

export async function loadState() {
  if (pool) {
    await pool.query('CREATE TABLE IF NOT EXISTS app_state (id integer PRIMARY KEY, body jsonb NOT NULL)');
    await pool.query('CREATE TABLE IF NOT EXISTS images (name text PRIMARY KEY, mime text NOT NULL, body bytea NOT NULL)');
    const result = await pool.query('SELECT body FROM app_state WHERE id = 1');
    const state = result.rows[0]?.body ?? {};
    return { products: state.products ?? [], regions: state.regions ?? [], runs: state.runs ?? [] };
  }
  mkdirSync(uploadDir, { recursive: true });
  if (!existsSync(stateFile)) return { products: [], regions: [], runs: [] };
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  return { products: state.products ?? [], regions: state.regions ?? [], runs: state.runs ?? [] };
}

export function saveState(state) {
  const snapshot = JSON.stringify(state);
  if (pool) {
    writes = writes.catch(() => {}).then(() => pool.query('INSERT INTO app_state (id, body) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body', [snapshot]));
    return writes;
  }
  mkdirSync(dataDir, { recursive: true });
  const tmp = `${stateFile}.tmp`;
  writeFileSync(tmp, snapshot, { mode: 0o600 });
  renameSync(tmp, stateFile);
  return Promise.resolve();
}

export async function saveImage(name, mime, body) {
  if (pool) await pool.query('INSERT INTO images (name, mime, body) VALUES ($1, $2, $3)', [name, mime, body]);
  else {
    mkdirSync(uploadDir, { recursive: true });
    writeFileSync(resolve(uploadDir, name), body);
  }
}

export async function readImage(name) {
  if (pool) {
    const result = await pool.query('SELECT mime, body FROM images WHERE name = $1', [name]);
    return result.rows[0] ?? null;
  }
  const path = resolve(uploadDir, name);
  if (!existsSync(path)) return null;
  const mime = /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : /\.gif$/i.test(name) ? 'image/gif' : /\.heic$/i.test(name) ? 'image/heic' : 'image/jpeg';
  return { mime, body: readFileSync(path) };
}

export async function imageBuffer(name) {
  const image = await readImage(name);
  if (!image) throw new Error(`Không tìm thấy ảnh ${name}`);
  return image.body;
}
