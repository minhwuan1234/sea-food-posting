import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataDir } from './store.js';

mkdirSync(dataDir, { recursive: true });
const profileDir = resolve(dataDir, 'facebook-profile');
const output = resolve(dataDir, 'facebook-storage-state.base64');
const context = await chromium.launchPersistentContext(profileDir, { headless: false });
try {
  const state = await context.storageState({ indexedDB: true });
  if (!state.cookies.some(cookie => cookie.domain.includes('facebook.com'))) {
    throw new Error('Chưa thấy cookie Facebook trong profile. Hãy chạy npm run login trước.');
  }
  writeFileSync(output, Buffer.from(JSON.stringify(state)).toString('base64'), { mode: 0o600 });
  console.log(`Đã xuất phiên vào ${output}. Đây là thông tin nhạy cảm; không đưa vào Git.`);
} finally {
  await context.close();
}
