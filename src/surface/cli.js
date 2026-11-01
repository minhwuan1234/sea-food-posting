import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const profileDir = resolve(root, 'data', 'facebook-profile');
const command = process.argv[2];

function options(args) {
  const result = { images: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--image') result.images.push(args[++i]);
    else if (arg === '--group' || arg === '--caption-file') result[arg.slice(2)] = args[++i];
    else throw new Error(`Tham số không hợp lệ: ${arg}`);
    if (arg === '--image' ? result.images.at(-1) === undefined : result[arg.slice(2)] === undefined) {
      throw new Error(`Thiếu giá trị cho ${arg}`);
    }
  }
  return result;
}

async function prompt(message) {
  const rl = createInterface({ input: stdin, output: stdout });
  try { return await rl.question(message); }
  finally { rl.close(); }
}

async function visible(locator) {
  try { return await locator.first().isVisible({ timeout: 1500 }); }
  catch { return false; }
}

async function firstVisible(locators) {
  for (const locator of locators) if (await visible(locator)) return locator.first();
  return null;
}

async function openComposer(page) {
  const trigger = await firstVisible([
    page.getByRole('button', { name: /viết gì đó|bạn viết gì đi|write something|create a post/i }),
    page.getByText(/viết gì đó|bạn viết gì đi|write something/i)
  ]);
  if (!trigger) throw new Error('Không tìm thấy ô tạo bài. Hãy kiểm tra quyền đăng trong group và giao diện Facebook.');
  await trigger.click();
  const editor = page.locator('[role="dialog"] [role="textbox"][contenteditable="true"], [role="dialog"] [contenteditable="true"]').first();
  await editor.waitFor({ state: 'visible', timeout: 15000 });
  return editor;
}

async function attachImages(page, images) {
  if (!images.length) return;
  const dialog = page.getByRole('dialog');
  const addPhotos = await firstVisible([
    dialog.getByRole('button', { name: /ảnh\/video|photo\/video|thêm ảnh|add photos/i }),
    dialog.getByText(/ảnh\/video|photo\/video/i)
  ]);
  if (addPhotos) await addPhotos.click();
  const input = dialog.locator('input[type="file"]').first();
  await input.waitFor({ state: 'attached', timeout: 10000 });
  await input.setInputFiles(images);
  console.log(`Đã chọn ${images.length} ảnh. Chờ Facebook tải ảnh và kiểm tra bản xem trước.`);
}

async function main() {
  if (!['login', 'post'].includes(command)) {
    console.log('Dùng: npm run login\nHoặc: npm run post -- --group URL --caption-file caption.txt --image anh1.jpg --image anh2.jpg');
    process.exitCode = 1;
    return;
  }
  const args = options(process.argv.slice(3));
  if (command === 'post') {
    if (!args.group || !args['caption-file']) throw new Error('Cần --group và --caption-file.');
    const u = new URL(args.group);
    if (!['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(u.hostname) || !u.pathname.startsWith('/groups/')) {
      throw new Error('--group phải là link group facebook.com/groups/...');
    }
    args.group = u.href;
    args['caption-file'] = resolve(args['caption-file']);
    if (!existsSync(args['caption-file'])) throw new Error('Không tìm thấy file caption.');
    args.images = args.images.map(path => resolve(path));
    for (const image of args.images) if (!existsSync(image)) throw new Error(`Không tìm thấy ảnh: ${image}`);
  }
  mkdirSync(profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'vi-VN'
  });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    page.setDefaultTimeout(12000);
    if (command === 'login') {
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
      console.log('Đăng nhập Facebook trong cửa sổ Chromium. Sau khi vào được Facebook, quay lại Terminal.');
      await prompt('Nhấn Enter để lưu phiên và đóng trình duyệt...');
      return;
    }
    await page.goto(args.group, { waitUntil: 'domcontentloaded' });
    if (page.url().includes('/login')) throw new Error('Chưa đăng nhập. Chạy npm run login trước.');
    const editor = await openComposer(page);
    const caption = readFileSync(args['caption-file'], 'utf8').trim();
    if (!caption) throw new Error('Caption đang trống.');
    await editor.fill(caption);
    await attachImages(page, args.images);
    const answer = (await prompt('Kiểm tra bài trong Chromium. Gõ DANG để bấm Đăng; Enter để hủy: ')).trim();
    if (answer !== 'DANG') {
      console.log('Đã hủy. Chưa bấm Đăng.');
      return;
    }
    const dialog = page.getByRole('dialog');
    const submit = await firstVisible([
      dialog.getByRole('button', { name: /^(đăng|post)$/i }),
      dialog.getByRole('button', { name: /đăng bài|post now/i })
    ]);
    if (!submit) throw new Error('Không tìm thấy nút Đăng. Có thể giao diện Facebook đã thay đổi.');
    await submit.click();
    console.log('Đã bấm Đăng. Kiểm tra trong Chromium xem bài đã hiển thị hoặc đang chờ duyệt.');
    await prompt('Nhấn Enter để đóng trình duyệt...');
  } finally {
    await context.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
