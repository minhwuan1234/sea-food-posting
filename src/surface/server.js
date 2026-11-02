import express from 'express';
import multer from 'multer';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { loadState, saveState, saveMedia, readMedia, root } from '../database/store.js';
import { mediaExtensions } from '../business/media.js';
import { AppError } from '../business/errors.js';
import { createProductsService } from '../business/products.js';
import { createRegionsService } from '../business/regions.js';
import { createPostingService } from '../business/posting.js';
import { productsRouter } from './routes/products.js';
import { regionsRouter } from './routes/regions.js';
import { postingRouter } from './routes/posting.js';

const port = Number(process.env.PORT || 4173);
const hosted = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.HOST === '0.0.0.0');
if (hosted && (!process.env.DATABASE_URL || !process.env.APP_PASSWORD)) {
  throw new Error('Railway cần DATABASE_URL và APP_PASSWORD trước khi chạy.');
}
const state = await loadState();
const persist = () => saveState(state);
const regions = createRegionsService({ state, persist });
const products = createProductsService({ state, persist, saveMedia, findRegion: regions.find });
const posting = createPostingService({ state, persist, products, regions, localPreviewAvailable: !hosted });
await posting.recoverInterruptedRuns();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => mediaExtensions[file.mimetype]
    ? cb(null, true)
    : cb(new AppError('Chỉ nhận ảnh JPG, PNG, WebP, GIF, HEIC hoặc video MP4, MOV.'))
});
const app = express();
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use((req, res, next) => {
  if (!process.env.APP_PASSWORD) return next();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
  const expected = `admin:${process.env.APP_PASSWORD}`;
  const a = Buffer.from(token); const b = Buffer.from(expected);
  if (a.length === b.length && timingSafeEqual(a, b)) return next();
  res.set('WWW-Authenticate', 'Basic realm="Facebook Group Poster"');
  return res.status(401).send('Cần đăng nhập.');
});
app.use(express.json({ limit: '1mb' }));
app.get('/uploads/:name', async (req, res) => {
  if (!/^[a-f0-9-]+\.(jpg|jpeg|png|webp|gif|heic|mp4|mov)$/i.test(req.params.name)) return res.sendStatus(404);
  const media = await readMedia(req.params.name);
  if (!media) return res.sendStatus(404);
  res.set('Accept-Ranges', 'bytes');
  res.type(media.mime);
  const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (req.headers.range && !range) return res.status(416).set('Content-Range', `bytes */${media.body.length}`).end();
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, media.body.length - Number(range[2]));
    const end = range[1] && range[2] ? Number(range[2]) : media.body.length - 1;
    if (start > end || start >= media.body.length || end >= media.body.length) return res.status(416).set('Content-Range', `bytes */${media.body.length}`).end();
    return res.status(206).set('Content-Range', `bytes ${start}-${end}/${media.body.length}`).send(media.body.subarray(start, end + 1));
  }
  res.send(media.body);
});
app.get('/', (_req, res) => res.redirect('/dang-bai'));
app.get(['/dang-bai', '/mat-hang', '/khu-vuc', '/lich-su'], (_req, res) => res.sendFile(resolve(root, 'public', 'index.html')));
app.use(express.static(resolve(root, 'public')));
app.get('/api/active-run', (_req, res) => res.json(posting.getActive()));
app.use('/api/products', productsRouter(products, upload));
app.use('/api/regions', regionsRouter(regions));
app.use('/api/runs', postingRouter(posting));
app.use((err, _req, res, _next) => {
  const status = err instanceof multer.MulterError ? 400 : err.status || 500;
  res.status(status).json({ error: err.message || 'Lỗi máy chủ.' });
});
const host = process.env.HOST || (hosted ? '0.0.0.0' : '127.0.0.1');
app.listen(port, host, () => console.log(`Mở http://${host}:${port}`));
