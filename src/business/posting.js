import { randomUUID } from 'node:crypto';
import { AppError, requireFound } from './errors.js';
import { launchFacebook, postToGroup } from './facebook.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createPostingService({ state, persist, products, regions, localPreviewAvailable }) {
  let activeRun = null;
  let stopRequested = false;
  let previewResolve = null;
  let workerLastSeenAt = 0;
  const workerOnline = () => Date.now() - workerLastSeenAt < 15000;
  const openRun = () => state.runs.find(run => ['queued', 'starting', 'running'].includes(run.status));

  async function waitForPreview(run, item, message, status) {
    item.status = status;
    item.message = message;
    const wait = new Promise(resolve => { previewResolve = resolve; });
    await persist();
    await wait;
    previewResolve = null;
  }

  async function executeRun(run, caption, images) {
    let browserSession;
    try {
      browserSession = await launchFacebook();
      run.status = 'running'; await persist();
      for (let index = 0; index < run.items.length; index++) {
        const item = run.items[index];
        if (stopRequested) { item.status = 'cancelled'; continue; }
        item.status = 'running'; item.startedAt = new Date().toISOString(); await persist();
        try {
          item.message = await postToGroup(browserSession.context, item.url, caption, images, {
            dryRun: run.dryRun,
            onPrepared: () => waitForPreview(run, item, 'Đã điền bài trong Chromium. Xem thử rồi bấm Tiếp tục trên giao diện; Playwright sẽ không bấm Đăng.', 'preview'),
            onError: err => waitForPreview(run, item, `${err.message} — Chromium đang giữ trang mở để bạn kiểm tra. Bấm Tiếp tục khi xem xong.`, 'preview_error')
          });
          item.status = run.dryRun ? 'previewed' : 'submitted';
        } catch (err) { item.message = err.message; item.status = err.uncertain ? 'needs_review' : 'failed'; run.error = err.message; stopRequested = true; }
        item.finishedAt = new Date().toISOString(); await persist();
        if (index < run.items.length - 1 && !stopRequested) {
          run.nextAt = new Date(Date.now() + 15000).toISOString(); await persist();
          for (let step = 0; step < 15 && !stopRequested; step++) await sleep(1000);
          run.nextAt = null; await persist();
        }
      }
      run.status = run.items.some(item => item.status === 'needs_review') ? 'needs_review'
        : run.error ? 'failed' : stopRequested ? 'stopped' : 'finished';
      for (const item of run.items) if (item.status === 'pending') item.status = 'cancelled';
    } catch (err) {
      run.status = 'failed'; run.error = err.message;
      for (const item of run.items) if (item.status === 'pending') item.status = 'cancelled';
    } finally {
      run.finishedAt = new Date().toISOString(); run.nextAt = null;
      try { await persist(); } finally {
        await browserSession?.close().catch(() => {});
        previewResolve = null; activeRun = null; stopRequested = false;
      }
    }
  }

  return {
    async recoverInterruptedRuns() {
      let changed = false;
      for (const run of state.runs) {
        if (!['starting', 'running'].includes(run.status)) continue;
        run.status = 'stopped'; run.error = 'Máy chủ đã khởi động lại trong lúc đăng.';
        for (const item of run.items) if (['pending', 'running', 'preview', 'preview_error'].includes(item.status)) item.status = 'cancelled';
        changed = true;
      }
      if (changed) await persist();
    },
    getActive() { return { run: state.runs.find(run => run.id === activeRun) ?? (!localPreviewAvailable ? openRun() : null) ?? null, localPreviewAvailable, workerOnline: !localPreviewAvailable && workerOnline() }; },
    list(offset = 0, limit = 20) {
      const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
      const safeLimit = Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 20));
      return { total: state.runs.length, offset: safeOffset, limit: safeLimit, items: state.runs.slice(safeOffset, safeOffset + safeLimit).map(run => ({
        id: run.id, productName: run.productName, regionName: run.regionName,
        dryRun: run.dryRun, status: run.status, startedAt: run.startedAt, itemCount: run.items.length
      })) };
    },
    get(id) { return requireFound(state.runs.find(item => item.id === id), 'Không tìm thấy lượt đăng.'); },
    async start(input) {
      if (activeRun || openRun()) throw new AppError('Đang có lượt đăng khác chạy hoặc chờ worker.', 409);
      if (!localPreviewAvailable && !workerOnline()) throw new AppError('Worker trên Mac chưa kết nối. Chạy npm run worker trên Mac rồi thử lại.', 503);
      const product = products.get(input.productId);
      const region = regions.get(input.regionId);
      const dryRun = input.dryRun === true;
      if (dryRun && !localPreviewAvailable) throw new AppError('Chế độ xem thử bằng Chromium chỉ chạy trên Mac local.');
      if (!region.groups.length) throw new AppError('Khu vực chưa có group.');
      const variant = product.variants[region.id];
      const caption = variant?.caption || product.caption;
      const images = variant?.images?.length ? variant.images : product.images;
      if (!caption) throw new AppError('Bài đăng chưa có caption.');
      const run = {
        id: randomUUID(), productId: product.id, productName: product.name, dryRun,
        regionId: region.id, regionName: region.name, caption, images: [...images],
        status: localPreviewAvailable ? 'starting' : 'queued', startedAt: new Date().toISOString(), finishedAt: null, nextAt: null,
        items: region.groups.map(group => ({ groupId: group.id, groupName: group.name, url: group.url, status: 'pending' }))
      };
      state.runs.unshift(run); stopRequested = false; await persist();
      if (localPreviewAvailable) {
        activeRun = run.id;
        void executeRun(run, caption, images).catch(error => console.error('Lỗi lượt đăng:', error));
      }
      return run;
    },
    async stop(id) {
      const run = this.get(id);
      if (localPreviewAvailable) {
        if (activeRun !== id) throw new AppError('Lượt đăng này không đang chạy.', 409);
        stopRequested = true; previewResolve?.();
        return;
      }
      if (!['queued', 'running'].includes(run.status)) throw new AppError('Lượt đăng này không đang chạy.', 409);
      run.stopRequested = true;
      if (run.status === 'queued' || !workerOnline()) {
        run.status = 'stopped'; run.finishedAt = new Date().toISOString();
        for (const item of run.items) if (['pending', 'running'].includes(item.status)) item.status = 'cancelled';
      }
      await persist();
    },
    continue(id) {
      if (activeRun !== id || !previewResolve) throw new AppError('Chưa có bản xem thử đang chờ.', 409);
      previewResolve();
    },
    nextForWorker() {
      if (localPreviewAvailable) throw new AppError('Worker chỉ dùng với Railway.', 409);
      workerLastSeenAt = Date.now();
      return { run: state.runs.find(run => run.status === 'queued') ?? null };
    },
    workerHeartbeat() {
      if (localPreviewAvailable) throw new AppError('Worker chỉ dùng với Railway.', 409);
      workerLastSeenAt = Date.now();
      return { ok: true };
    },
    async claimForWorker(id) {
      if (localPreviewAvailable) throw new AppError('Worker chỉ dùng với Railway.', 409);
      workerLastSeenAt = Date.now();
      const run = this.get(id);
      if (run.status !== 'queued') throw new AppError('Lượt đăng đã được nhận hoặc đã dừng.', 409);
      run.status = 'running';
      await persist();
      return run;
    },
    workerControl(id) {
      workerLastSeenAt = Date.now();
      const run = this.get(id);
      return { stopRequested: run.stopRequested === true, status: run.status };
    },
    async reportFromWorker(id, index, input) {
      workerLastSeenAt = Date.now();
      const run = this.get(id);
      if (run.status !== 'running') throw new AppError('Lượt đăng không còn hoạt động.', 409);
      const item = run.items[index];
      if (!item) throw new AppError('Không tìm thấy group trong lượt đăng.', 404);
      if (!['running', 'submitted', 'failed', 'needs_review', 'cancelled'].includes(input.status)) throw new AppError('Trạng thái group không hợp lệ.');
      item.status = input.status;
      if (input.status === 'running') item.startedAt = new Date().toISOString();
      if (input.status !== 'running') item.finishedAt = new Date().toISOString();
      if (typeof input.message === 'string') item.message = input.message.slice(0, 2000);
      run.nextAt = input.nextAt ?? null;
      await persist();
      return this.workerControl(id);
    },
    async finishFromWorker(id, input) {
      workerLastSeenAt = Date.now();
      const run = this.get(id);
      if (run.status !== 'running') throw new AppError('Lượt đăng không còn hoạt động.', 409);
      run.status = input.needsReview ? 'needs_review' : input.error ? 'failed' : run.stopRequested ? 'stopped' : 'finished';
      if (input.error) run.error = String(input.error).slice(0, 2000);
      for (const item of run.items) if (item.status === 'pending') item.status = 'cancelled';
      run.finishedAt = new Date().toISOString(); run.nextAt = null;
      await persist();
      return run;
    }
  };
}
