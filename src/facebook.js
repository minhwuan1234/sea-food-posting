import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { dataDir, imageBuffer } from './store.js';

const profileDir = resolve(dataDir, 'facebook-profile');
const posterNames = /^(đăng|post|đăng bài|post now)$/i;

export function validGroupUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname)
      && /^\/groups\/[^/]+/.test(url.pathname);
  } catch { return false; }
}

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

export async function postToGroup(context, groupUrl, caption, imageNames, options = {}) {
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
    if (imageNames.length) {
      const addPhotos = await firstVisible([
        dialog.getByRole('button', { name: /ảnh\/video|photo\/video|thêm ảnh|add photos/i }),
        dialog.getByText(/ảnh\/video|photo\/video/i)
      ]);
      if (addPhotos) { await addPhotos.click(); await page.waitForTimeout(2000); }
      const input = dialog.locator('input[type="file"]').first();
      await input.waitFor({ state: 'attached', timeout: 10000 });
      const files = await Promise.all(imageNames.map(async name => ({
        name, mimeType: /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : /\.gif$/i.test(name) ? 'image/gif' : /\.heic$/i.test(name) ? 'image/heic' : 'image/jpeg',
        buffer: await imageBuffer(name)
      })));
      await input.setInputFiles(files);
      await page.waitForTimeout(2000);
    }
    const submit = await firstVisible([
      dialog.getByRole('button', { name: posterNames }),
      page.getByRole('button', { name: posterNames })
    ]);
    if (!submit) throw new Error('Không thấy nút Đăng.');
    if (options.dryRun) {
      await options.onPrepared?.();
      return 'Chạy thử xong: đã điền nội dung, không bấm Đăng.';
    }
    await page.waitForTimeout(2000);
    await submit.click();
    await page.waitForTimeout(1500);
    if (await dialog.isVisible().catch(() => false)) {
      throw new Error('Đã bấm Đăng nhưng hộp soạn bài vẫn mở; hãy kiểm tra thủ công.');
    }
    return 'Đã gửi bài; kiểm tra Facebook nếu group yêu cầu duyệt.';
  } catch (err) {
    if (options.dryRun) await options.onError?.(err);
    throw err;
  } finally {
    await page.close().catch(() => {});
  }
}
