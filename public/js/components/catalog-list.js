import { escape, isVideo } from './shared.js';

export function productList(products) {
  if (!products.length) return '<div class="empty-state">Chưa có mặt hàng. Tạo mặt hàng đầu tiên để thêm caption, ảnh và video.</div>';
  return `<div class="catalog-grid">${products.map(product => `<article class="catalog-item"><div class="catalog-image">${product.coverMedia ? isVideo(product.coverMedia) ? `<video preload="metadata" muted playsinline src="/uploads/${encodeURIComponent(product.coverMedia)}" aria-label="Video ${escape(product.name)}"></video><span class="video-badge">▶ Video</span>` : `<img loading="lazy" src="/uploads/${encodeURIComponent(product.coverMedia)}" alt="Ảnh ${escape(product.name)}">` : '<span>Chưa có ảnh/video</span>'}</div><div class="catalog-body"><strong>${escape(product.name)}</strong><small>${product.imageCount} ảnh · ${product.videoCount} video · ${product.variantCount} khu vực tùy chỉnh</small><div class="item-actions"><button data-product-edit="${product.id}">Chỉnh sửa</button><button class="remove" data-product-delete="${product.id}">Xóa</button></div></div></article>`).join('')}</div>`;
}

export function regionList(regions) {
  if (!regions.length) return '<div class="empty-state">Chưa có khu vực. Tạo khu vực để thêm group.</div>';
  return `<div class="tree-list">${regions.map(region => `<div class="tree-node"><div class="tree-line"><span class="tree-icon">⌄</span><div><strong>${escape(region.name)}</strong><small>${region.groupCount} group</small></div></div><div class="item-actions"><button data-region-edit="${region.id}">Chỉnh sửa</button><button class="remove" data-region-delete="${region.id}">Xóa</button></div></div>`).join('')}</div>`;
}
