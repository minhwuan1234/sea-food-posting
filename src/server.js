import express from 'express';
import multer from 'multer';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { loadState, saveState, saveImage, readImage, root } from './store.js';
import { launchFacebook, postToGroup, validGroupUrl } from './facebook.js';

const app = express();
const port = Number(process.env.PORT || 4173);
if ((process.env.RAILWAY_ENVIRONMENT || process.env.HOST === '0.0.0.0') && (!process.env.DATABASE_URL || !process.env.APP_PASSWORD)) {
  throw new Error('Railway cần DATABASE_URL và APP_PASSWORD trước khi chạy.');
}
const state = await loadState();
for (const run of state.runs) {
  if (['starting', 'running'].includes(run.status)) {
    run.status = 'stopped'; run.error = 'Máy chủ đã khởi động lại trong lúc đăng.';
    for (const item of run.items) if (['pending', 'running'].includes(item.status)) item.status = 'cancelled';
  }
}
await saveState(state);
let activeRun = null;
let stopRequested = false;
let previewResolve = null;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif|heic)$/.test(file.mimetype))
});

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
  if (!/^[a-f0-9-]+\.(jpg|jpeg|png|webp|gif|heic)$/i.test(req.params.name)) return res.sendStatus(404);
  const image = await readImage(req.params.name);
  if (!image) return res.sendStatus(404);
  res.type(image.mime); res.send(image.body);
});
app.use(express.static(resolve(root, 'public')));

function text(value, max = 20000) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function error(res, message, code = 400) { return res.status(code).json({ error: message }); }
function publish() { return saveState(state); }
function findProduct(id) { return state.products.find(item => item.id === id); }
function findRegion(id) { return state.regions.find(item => item.id === id); }
function validImages(images) {
  return Array.isArray(images) && images.every(name => typeof name === 'string' && /^[a-f0-9-]+\.(jpg|jpeg|png|webp|gif|heic)$/i.test(name));
}

app.get('/api/state', (_req, res) => res.json({ ...state, activeRun, localPreviewAvailable: !process.env.RAILWAY_ENVIRONMENT && process.env.HOST !== '0.0.0.0' }));

app.post('/api/products', async (req, res) => {
  const name = text(req.body.name, 150);
  const caption = text(req.body.caption);
  if (!name || !caption) return error(res, 'Cần tên mặt hàng và caption.');
  const product = { id: randomUUID(), name, caption, images: [], variants: {}, createdAt: new Date().toISOString() };
  state.products.push(product); await publish(); res.status(201).json(product);
});

app.put('/api/products/:id', async (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) return error(res, 'Không tìm thấy mặt hàng.', 404);
  const name = text(req.body.name, 150);
  const caption = text(req.body.caption);
  if (!name || !caption) return error(res, 'Cần tên mặt hàng và caption.');
  product.name = name; product.caption = caption; await publish(); res.json(product);
});

app.delete('/api/products/:id', async (req, res) => {
  const index = state.products.findIndex(item => item.id === req.params.id);
  if (index < 0) return error(res, 'Không tìm thấy mặt hàng.', 404);
  state.products.splice(index, 1); await publish(); res.json({ ok: true });
});

app.post('/api/products/:id/images', upload.array('images', 20), async (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) return error(res, 'Không tìm thấy mặt hàng.', 404);
  const regionId = req.query.regionId;
  if (regionId && !findRegion(regionId)) return error(res, 'Không tìm thấy khu vực.', 404);
  if (!req.files?.length) return error(res, 'Chọn ảnh JPG, PNG, WebP, GIF hoặc HEIC.');
  const names = [];
  const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic' };
  for (const file of req.files) {
    const name = `${randomUUID()}${extensions[file.mimetype]}`;
    await saveImage(name, file.mimetype, file.buffer);
    names.push(name);
  }
  if (regionId) {
    const variant = product.variants[regionId] ?? { caption: '', images: [] };
    variant.images.push(...names); product.variants[regionId] = variant;
  } else product.images.push(...names);
  await publish(); res.json(product);
});

app.put('/api/products/:id/images', async (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) return error(res, 'Không tìm thấy mặt hàng.', 404);
  if (!validImages(req.body.images)) return error(res, 'Danh sách ảnh không hợp lệ.');
  const regionId = req.body.regionId;
  const current = regionId ? product.variants[regionId]?.images ?? [] : product.images;
  if (!req.body.images.every(name => current.includes(name))) return error(res, 'Ảnh không thuộc mặt hàng này.');
  if (regionId) {
    if (!findRegion(regionId)) return error(res, 'Không tìm thấy khu vực.', 404);
    const variant = product.variants[regionId] ?? { caption: '', images: [] };
    variant.images = req.body.images; product.variants[regionId] = variant;
  } else product.images = req.body.images;
  await publish(); res.json(product);
});

app.put('/api/products/:id/variants/:regionId', async (req, res) => {
  const product = findProduct(req.params.id);
  if (!product || !findRegion(req.params.regionId)) return error(res, 'Không tìm thấy mặt hàng hoặc khu vực.', 404);
  const variant = product.variants[req.params.regionId] ?? { caption: '', images: [] };
  variant.caption = text(req.body.caption);
  product.variants[req.params.regionId] = variant;
  await publish(); res.json(product);
});

app.post('/api/regions', async (req, res) => {
  const name = text(req.body.name, 150);
  if (!name) return error(res, 'Cần tên khu vực.');
  const region = { id: randomUUID(), name, groups: [] };
  state.regions.push(region); await publish(); res.status(201).json(region);
});

app.put('/api/regions/:id', async (req, res) => {
  const region = findRegion(req.params.id);
  if (!region) return error(res, 'Không tìm thấy khu vực.', 404);
  const name = text(req.body.name, 150);
  if (!name) return error(res, 'Cần tên khu vực.');
  region.name = name; await publish(); res.json(region);
});

app.delete('/api/regions/:id', async (req, res) => {
  const index = state.regions.findIndex(item => item.id === req.params.id);
  if (index < 0) return error(res, 'Không tìm thấy khu vực.', 404);
  state.regions.splice(index, 1);
  for (const product of state.products) delete product.variants[req.params.id];
  await publish(); res.json({ ok: true });
});

app.post('/api/regions/:id/groups', async (req, res) => {
  const region = findRegion(req.params.id);
  if (!region) return error(res, 'Không tìm thấy khu vực.', 404);
  const name = text(req.body.name, 150);
  const url = text(req.body.url, 1000);
  if (!name || !validGroupUrl(url)) return error(res, 'Cần tên và link Facebook group hợp lệ.');
  if (region.groups.some(group => group.url === url)) return error(res, 'Group đã có trong khu vực này.');
  const group = { id: randomUUID(), name, url };
  region.groups.push(group); await publish(); res.status(201).json(group);
});

app.put('/api/regions/:id/groups/:groupId', async (req, res) => {
  const group = findRegion(req.params.id)?.groups.find(item => item.id === req.params.groupId);
  if (!group) return error(res, 'Không tìm thấy group.', 404);
  const name = text(req.body.name, 150);
  const url = text(req.body.url, 1000);
  if (!name || !validGroupUrl(url)) return error(res, 'Cần tên và link Facebook group hợp lệ.');
  group.name = name; group.url = url; await publish(); res.json(group);
});

app.delete('/api/regions/:id/groups/:groupId', async (req, res) => {
  const region = findRegion(req.params.id);
  if (!region) return error(res, 'Không tìm thấy khu vực.', 404);
  const index = region.groups.findIndex(item => item.id === req.params.groupId);
  if (index < 0) return error(res, 'Không tìm thấy group.', 404);
  region.groups.splice(index, 1); await publish(); res.json({ ok: true });
});

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function executeRun(run, caption, images) {
  let browserSession;
  try {
    browserSession = await launchFacebook();
    run.status = 'running'; await publish();
    for (let i = 0; i < run.items.length; i++) {
      const item = run.items[i];
      if (stopRequested) { item.status = 'cancelled'; continue; }
      item.status = 'running'; item.startedAt = new Date().toISOString(); await publish();
      try {
        item.message = await postToGroup(browserSession.context, item.url, caption, images, {
          dryRun: run.dryRun,
          onPrepared: async () => {
            item.status = 'preview';
            item.message = 'Đã điền bài trong Chromium. Xem thử rồi bấm Tiếp tục trên giao diện; Playwright sẽ không bấm Đăng.';
            const wait = new Promise(resolve => { previewResolve = resolve; });
            await publish();
            await wait;
            previewResolve = null;
          },
          onError: async err => {
            item.status = 'preview_error';
            item.message = `${err.message} — Chromium đang giữ trang mở để bạn kiểm tra. Bấm Tiếp tục khi xem xong.`;
            const wait = new Promise(resolve => { previewResolve = resolve; });
            await publish();
            await wait;
            previewResolve = null;
          }
        });
        item.status = run.dryRun ? 'previewed' : 'submitted';
      } catch (err) {
        item.message = err.message; item.status = 'failed';
      }
      item.finishedAt = new Date().toISOString(); await publish();
      if (i < run.items.length - 1 && !stopRequested) {
        run.nextAt = new Date(Date.now() + 15000).toISOString(); await publish();
        for (let step = 0; step < 15 && !stopRequested; step++) await sleep(1000);
        run.nextAt = null; await publish();
      }
    }
    run.status = stopRequested ? 'stopped' : 'finished';
  } catch (err) {
    run.status = 'failed'; run.error = err.message;
    for (const item of run.items) if (item.status === 'pending') item.status = 'cancelled';
  } finally {
    run.finishedAt = new Date().toISOString(); run.nextAt = null;
    await publish();
    await browserSession?.close().catch(() => {});
    previewResolve = null;
    activeRun = null; stopRequested = false;
  }
}

app.post('/api/runs', async (req, res) => {
  if (activeRun) return error(res, 'Đang có lượt đăng khác chạy.', 409);
  const product = findProduct(req.body.productId);
  const region = findRegion(req.body.regionId);
  if (!product || !region) return error(res, 'Chọn mặt hàng và khu vực hợp lệ.');
  const dryRun = req.body.dryRun === true;
  if (dryRun && (process.env.RAILWAY_ENVIRONMENT || process.env.HOST === '0.0.0.0')) return error(res, 'Chế độ xem thử bằng Chromium chỉ chạy trên Mac local.');
  if (!region.groups.length) return error(res, 'Khu vực chưa có group.');
  const variant = product.variants[region.id];
  const caption = variant?.caption || product.caption;
  const images = variant?.images?.length ? variant.images : product.images;
  if (!caption) return error(res, 'Bài đăng chưa có caption.');
  const run = {
    id: randomUUID(), productId: product.id, productName: product.name, dryRun,
    regionId: region.id, regionName: region.name, caption, images: [...images],
    status: 'starting', startedAt: new Date().toISOString(), finishedAt: null, nextAt: null,
    items: region.groups.map(group => ({ groupId: group.id, groupName: group.name, url: group.url, status: 'pending' }))
  };
  state.runs.unshift(run); activeRun = run.id; stopRequested = false; await publish();
  executeRun(run, caption, images);
  res.status(201).json(run);
});

app.post('/api/runs/:id/stop', (req, res) => {
  if (activeRun !== req.params.id) return error(res, 'Lượt đăng này không đang chạy.', 409);
  stopRequested = true; previewResolve?.(); res.json({ ok: true });
});

app.post('/api/runs/:id/continue', (req, res) => {
  if (activeRun !== req.params.id || !previewResolve) return error(res, 'Chưa có bản xem thử đang chờ.', 409);
  previewResolve(); res.json({ ok: true });
});

app.use((err, _req, res, _next) => error(res, err.message || 'Lỗi máy chủ.', 500));
const host = process.env.HOST || (process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '127.0.0.1');
app.listen(port, host, () => console.log(`Mở http://${host}:${port}`));
