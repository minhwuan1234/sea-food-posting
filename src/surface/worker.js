import { stdin, stdout } from 'node:process';
import { launchFacebook, postToGroup } from '../business/facebook.js';

const base = (process.env.REMOTE_URL || 'https://sea-food-posting-production.up.railway.app').replace(/\/$/, '');
const remote = new URL(base);
if (remote.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(remote.hostname)) {
  throw new Error('REMOTE_URL cần dùng HTTPS để bảo vệ APP_PASSWORD.');
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function readPassword() {
  if (process.env.APP_PASSWORD) return process.env.APP_PASSWORD;
  if (!stdin.isTTY) throw new Error('Chạy worker trong Terminal để nhập APP_PASSWORD Railway.');
  stdout.write('APP_PASSWORD Railway: ');
  return new Promise((resolve, reject) => {
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    const onData = chunk => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\r' || char === '\n') {
          stdin.off('data', onData); stdin.setRawMode(false); stdin.pause(); stdout.write('\n');
          return value ? resolve(value) : reject(new Error('Cần APP_PASSWORD.'));
        }
        if (char === '\u0003') {
          stdin.off('data', onData); stdin.setRawMode(false); stdout.write('\n');
          return reject(new Error('Đã hủy.'));
        }
        if (char === '\u007f') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

const password = await readPassword();
const authorization = `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;

async function request(path, method = 'GET', body) {
  const response = await fetch(`${base}/api/worker${path}`, {
    method, headers: { Authorization: authorization, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text || `HTTP ${response.status}` }; }
  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function processRun(queued) {
  const run = await request(`/runs/${queued.id}/claim`, 'POST');
  console.log(`Nhận lượt đăng ${run.productName} → ${run.regionName} (${run.items.length} group).`);
  let browser;
  let error;
  try {
    browser = await launchFacebook();
    for (const [index, item] of run.items.entries()) {
      const control = await request(`/runs/${run.id}/control`);
      if (control.stopRequested || control.status !== 'running') break;
      await request(`/runs/${run.id}/items/${index}`, 'POST', { status: 'running' });
      let status = 'submitted';
      let message;
      try { message = await postToGroup(browser.context, item.url, run.caption, run.images); }
      catch (cause) { status = 'failed'; message = cause.message; }
      const nextAt = index < run.items.length - 1 ? new Date(Date.now() + 15000).toISOString() : null;
      await request(`/runs/${run.id}/items/${index}`, 'POST', { status, message, nextAt });
      console.log(`${index + 1}/${run.items.length} ${item.groupName}: ${status} — ${message}`);
      if (nextAt) {
        for (let second = 0; second < 15; second++) {
          await sleep(1000);
          if ((await request(`/runs/${run.id}/control`)).stopRequested) break;
        }
      }
    }
  } catch (cause) { error = cause; }
  finally {
    await browser?.close().catch(() => {});
    try { await request(`/runs/${run.id}/finish`, 'POST', { error: error?.message }); }
    catch (cause) { console.error('Không thể lưu kết quả lượt đăng:', cause.message); }
  }
  if (error) console.error('Lượt đăng lỗi:', error.message);
}

console.log(`Worker Mac đang kết nối ${base}. Giữ Terminal này mở; Chromium sẽ xuất hiện khi có lượt đăng.`);
setInterval(() => request('/heartbeat', 'POST').catch(() => {}), 5000).unref();
while (true) {
  try {
    const { run } = await request('/next');
    if (run) await processRun(run);
    else await sleep(2000);
  } catch (error) {
    if (error.status === 401) { console.error('APP_PASSWORD Railway không đúng.'); process.exitCode = 1; break; }
    console.error('Worker chưa kết nối:', error.message);
    await sleep(5000);
  }
}
