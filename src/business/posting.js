import { randomUUID } from 'node:crypto';
import { AppError, requireFound } from './errors.js';
import { launchFacebook, postToGroup } from './facebook.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createPostingService({ state, persist, products, regions, localPreviewAvailable }) {
  let activeRun = null;
  let stopRequested = false;
  let previewResolve = null;

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
        } catch (err) { item.message = err.message; item.status = 'failed'; }
        item.finishedAt = new Date().toISOString(); await persist();
        if (index < run.items.length - 1 && !stopRequested) {
          run.nextAt = new Date(Date.now() + 15000).toISOString(); await persist();
          for (let step = 0; step < 15 && !stopRequested; step++) await sleep(1000);
          run.nextAt = null; await persist();
        }
      }
      run.status = stopRequested ? 'stopped' : 'finished';
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
    getActive() { return { run: state.runs.find(run => run.id === activeRun) ?? null, localPreviewAvailable }; },
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
      if (activeRun) throw new AppError('Đang có lượt đăng khác chạy.', 409);
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
        status: 'starting', startedAt: new Date().toISOString(), finishedAt: null, nextAt: null,
        items: region.groups.map(group => ({ groupId: group.id, groupName: group.name, url: group.url, status: 'pending' }))
      };
      state.runs.unshift(run); activeRun = run.id; stopRequested = false; await persist();
      void executeRun(run, caption, images).catch(error => console.error('Lỗi lượt đăng:', error));
      return run;
    },
    stop(id) {
      if (activeRun !== id) throw new AppError('Lượt đăng này không đang chạy.', 409);
      stopRequested = true; previewResolve?.();
    },
    continue(id) {
      if (activeRun !== id || !previewResolve) throw new AppError('Chưa có bản xem thử đang chờ.', 409);
      previewResolve();
    }
  };
}
