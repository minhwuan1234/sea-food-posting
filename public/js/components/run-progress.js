import { escape, statusText } from './shared.js';

export function runProgress(run) {
  if (!run) return '<div class="empty-state">Chưa có lượt đăng đang chạy.</div>';
  const done = run.items.filter(item => ['submitted', 'previewed', 'failed', 'cancelled'].includes(item.status)).length;
  const next = run.nextAt ? Math.max(0, Math.ceil((new Date(run.nextAt).getTime() - Date.now()) / 1000)) : null;
  const previewOpen = run.items.some(item => ['preview', 'preview_error'].includes(item.status));
  return `<div class="progress-head"><strong>${run.dryRun ? 'Chạy thử · ' : ''}${escape(run.productName)} · ${escape(run.regionName)}</strong><span>${done}/${run.items.length}</span></div>${next !== null ? `<p class="countdown">Group tiếp theo sau ${next} giây</p>` : ''}<div class="progress-list">${run.items.map(item => `<div class="run-row"><span>${escape(item.groupName)}</span><span class="status ${escape(item.status)}">${statusText(item.status)}</span></div>`).join('')}</div><div class="button-row">${previewOpen ? '<button id="continue-run" class="primary">Đã xem xong · Tiếp tục</button>' : ''}<button id="stop-run" class="danger">Dừng sau group hiện tại</button></div>`;
}
