import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { dataDir, mediaBuffer } from '../database/store.js';
import { validGroupUrl } from './validation.js';
import { mediaMime } from './media.js';

const profileDir = resolve(dataDir, 'facebook-profile');
const posterNames = /^(đăng|post|đăng bài|post now)$/i;

async function firstVisible(locators) {
  for (const locator of locators) {
    if (await locator.first().isVisible().catch(() => false)) return locator.first();
  }
  return null;
}

export async function launchFacebook() {
  if (process.env.RAILWAY_ENVIRONMENT || process.env.FACEBOOK_STORAGE_STATE_BASE64) {
    if (!process.env.FACEBOOK_STORAGE_STATE_BASE64) throw new Error('Thiếu FACEBOOK_STORAGE_STATE_BASE64.');
    const storageState = JSON.parse(Buffer.from(process.env.FACEBOOK_STORAGE_STATE_BASE64, 'base64').toString('utf8'));
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ storageState, viewport: { width: 1280, height: 900 }, locale: 'vi-VN' });
    return { context, close: async () => { await context.close(); await browser.close(); } };
  }
  const context = await chromium.launchPersistentContext(profileDir, { headless: false, viewport: { width: 1280, height: 900 }, locale: 'vi-VN' });
  return { context, close: () => context.close() };
}

export async function postToGroup(context, groupUrl, caption, mediaNames, options = {}) {
  if (!validGroupUrl(groupUrl)) throw new Error('Link group không hợp lệ.');
  const page = await context.newPage();
  try {
    page.setDefaultTimeout(15000);
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (/facebook\.com\/(login|checkpoint)/.test(page.url())) throw new Error('Facebook yêu cầu đăng nhập hoặc xác minh tài khoản.');
    const trigger = page.getByRole('button', { name: /viết gì đó|bạn viết gì đi|write something|create a post/i }).first();
    try { await trigger.waitFor({ state: 'visible', timeout: 20000 }); }
    catch { throw new Error('Không thấy ô tạo bài trong group.'); }
    await page.waitForTimeout(2000);
    await trigger.click();
    await page.waitForTimeout(2000);
    const dialog = page.getByRole('dialog').filter({ has: page.locator('[contenteditable="true"]') }).first();
    const editor = dialog.locator('[role="textbox"][contenteditable="true"], [contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: 15000 });
    await editor.fill(caption);
    await page.waitForTimeout(2000);
    if (mediaNames.length) {
      const addPhotos = await firstVisible([
        dialog.getByRole('button', { name: /ảnh\/video|photo\/video|thêm ảnh|add photos/i }),
        dialog.getByText(/ảnh\/video|photo\/video/i)
      ]);
      if (addPhotos) { await addPhotos.click(); await page.waitForTimeout(2000); }
      const input = dialog.locator('input[type="file"]').first();
      await input.waitFor({ state: 'attached', timeout: 10000 });
      const loadMedia = options.loadMedia ?? mediaBuffer;
      const files = await Promise.all(mediaNames.map(async name => ({
        name, mimeType: mediaMime(name),
        buffer: await loadMedia(name)
      })));
      await input.setInputFiles(files);
      await page.waitForTimeout(2000);
    }
    const submit = await firstVisible([
      dialog.getByRole('button', { name: posterNames }),
      page.getByRole('button', { name: posterNames })
    ]);
    if (!submit) throw new Error('Không thấy nút Đăng.');
    await submit.click({ trial: true, timeout: mediaNames.length ? 120000 : 15000 });
    if (options.dryRun) {
      await options.onPrepared?.();
      return 'Chạy thử xong: đã điền nội dung, không bấm Đăng.';
    }
    await page.waitForTimeout(2000);
    try { await submit.click(); }
    catch {
      const error = new Error('Không xác nhận được kết quả sau khi bấm Đăng. Kiểm tra bài trong Chromium trước khi đăng lại.');
      error.uncertain = true;
      throw error;
    }
    const confirmationTimeout = mediaNames.some(name => mediaMime(name).startsWith('video/')) ? 120000 : 30000;
    try { await dialog.waitFor({ state: 'hidden', timeout: confirmationTimeout }); }
    catch {
      const error = new Error('Đã bấm Đăng nhưng chưa xác nhận Facebook hoàn tất. Kiểm tra bài trong Chromium trước khi đăng lại.');
      error.uncertain = true;
      throw error;
    }
    return 'Đã gửi bài; kiểm tra Facebook nếu group yêu cầu duyệt.';
  } catch (err) {
    if (options.dryRun || err.uncertain) await options.onError?.(err);
    throw err;
  } finally {
    await page.close().catch(() => {});
  }
}
