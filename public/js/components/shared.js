export const $ = selector => document.querySelector(selector);
export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = {}; }
  if (!response.ok) throw new Error(`${data.error || 'Không thể thực hiện.'} (HTTP ${response.status}, /api${path})`);
  return data;
}

export function notice(message, isError = false) {
  const box = $('#notice');
  box.textContent = message;
  box.classList.toggle('error', isError);
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => { box.textContent = ''; box.classList.remove('error'); }, 7000);
}
export async function act(fn) { try { await fn(); } catch (err) { notice(err.message, true); } }
export function optionList(items, selected, placeholder) {
  if (!items.length) return `<option value="">${escape(placeholder)}</option>`;
  return items.map(item => `<option value="${item.id}" ${item.id === selected ? 'selected' : ''}>${escape(item.name)}</option>`).join('');
}
export const isVideo = name => /\.(mp4|mov)$/i.test(name || '');
export function mediaSummary(media) {
  const videos = (media || []).filter(isVideo).length;
  const images = (media || []).length - videos;
  return [images ? `${images} ảnh` : '', videos ? `${videos} video` : ''].filter(Boolean).join(' · ') || 'Chưa có ảnh/video';
}
export function mediaMarkup(media, controls = false, scope = '') {
  return (media || []).map((name, index) => `<div class="image-tile ${isVideo(name) ? 'video-tile' : ''}">${isVideo(name) ? `<video controls preload="metadata" playsinline src="/uploads/${encodeURIComponent(name)}" aria-label="Video ${index + 1}"></video>` : `<img loading="lazy" src="/uploads/${encodeURIComponent(name)}" alt="Ảnh ${index + 1}">`}${controls ? `<div class="image-tools"><button data-image-action="up" data-scope="${scope}" data-index="${index}" title="Lên">↑</button><button data-image-action="down" data-scope="${scope}" data-index="${index}" title="Xuống">↓</button><button data-image-action="remove" data-scope="${scope}" data-index="${index}" title="Bỏ khỏi bài">×</button></div>` : ''}</div>`).join('');
}
export function statusText(status) {
  return ({ queued: 'Chờ worker', starting: 'Đang mở', running: 'Đang xử lý', preview: 'Đang xem thử', preview_error: 'Cần kiểm tra', previewed: 'Đã xem thử', submitted: 'Đã gửi', failed: 'Lỗi', pending: 'Chờ', cancelled: 'Đã bỏ qua', finished: 'Hoàn tất', stopped: 'Đã dừng' })[status] || status;
}
