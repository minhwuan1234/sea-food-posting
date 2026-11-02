import { escape, mediaMarkup, statusText } from './shared.js';

export function runCard(run, detail) {
  return `<article class="run-card"><div class="run-head"><div><span class="eyebrow">${run.dryRun ? 'CHẠY THỬ' : 'ĐĂNG BÀI'}</span><h2>${escape(run.productName)} <span>→</span> ${escape(run.regionName)}</h2><small>${new Date(run.startedAt).toLocaleString('vi-VN')} · ${run.itemCount} group</small></div><span class="status ${escape(run.status)}">${statusText(run.status)}</span></div><details data-run-id="${run.id}"><summary>Xem nội dung và kết quả</summary><div class="run-detail">${detail ? runDetail(detail) : ''}</div></details></article>`;
}

export function runDetail(run) {
  return `<div class="run-content"><p class="caption">${escape(run.caption)}</p><div class="images">${mediaMarkup(run.images)}</div></div>${run.error ? `<p class="status failed">${escape(run.error)}</p>` : ''}<div class="run-targets">${run.items.map(item => `<div class="run-row"><span><strong>${escape(item.groupName)}</strong><br><small>${escape(item.message || '')}</small></span><span class="status ${escape(item.status)}">${statusText(item.status)}</span></div>`).join('')}</div>`;
}
