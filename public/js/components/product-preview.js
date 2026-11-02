import { escape, isVideo, mediaMarkup, mediaSummary } from './shared.js';

export function effectiveContent(product, regionId) {
  const variant = product?.variants?.[regionId];
  return { caption: variant?.caption || product?.caption || '', images: variant?.images?.length ? variant.images : product?.images || [] };
}

export function productPreview(product, region) {
  if (!product || !region) return '<div class="empty-state">Tạo mặt hàng và khu vực để xem trước bài đăng.</div>';
  const content = effectiveContent(product, region.id);
  const first = content.images[0];
  const hero = first
    ? isVideo(first) ? `<video class="product-hero-image" controls preload="metadata" playsinline src="/uploads/${encodeURIComponent(first)}" aria-label="Video của ${escape(product.name)}"></video>` : `<img class="product-hero-image" src="/uploads/${encodeURIComponent(first)}" alt="Ảnh chính của ${escape(product.name)}">`
    : '<div class="product-hero-placeholder">Chưa có ảnh/video</div>';
  return `<div class="product-preview"><div class="product-visual">${hero}</div><div class="product-copy"><span class="eyebrow">BẢN XEM TRƯỚC</span><h2>${escape(product.name)}</h2><p class="product-destination">Đăng tại ${escape(region.name)} · ${region.groups.length} group</p><div class="caption">${escape(content.caption)}</div><div class="images">${mediaMarkup(content.images)}</div><p class="fine-note">${mediaSummary(content.images)} · ${region.groups.map(group => escape(group.name)).join(' · ')}</p></div></div>`;
}
