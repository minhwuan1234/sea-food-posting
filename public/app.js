const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let state = { products: [], regions: [], runs: [], activeRun: null };
let editingProduct = null;
let editingRegion = null;
let selectedProduct = '';
let selectedRegion = '';
let selectedVariantRegion = '';

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Không thể thực hiện.');
  return data;
}

function notice(message, isError = false) {
  const box = $('#notice');
  box.textContent = message;
  box.classList.toggle('error', isError);
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => { box.textContent = ''; box.classList.remove('error'); }, 7000);
}

async function act(fn) {
  try { await fn(); } catch (err) { notice(err.message, true); }
}

async function refresh(full = true) {
  state = await api('/state');
  if (!state.products.some(p => p.id === selectedProduct)) selectedProduct = state.products[0]?.id || '';
  if (!state.regions.some(r => r.id === selectedRegion)) selectedRegion = state.regions[0]?.id || '';
  if (!state.regions.some(r => r.id === selectedVariantRegion)) selectedVariantRegion = state.regions[0]?.id || '';
  if (full) { renderProducts(); renderRegions(); }
  renderPublish(); renderHistory();
}

function optionList(items, selected, placeholder) {
  if (!items.length) return `<option value="">${escape(placeholder)}</option>`;
  return items.map(item => `<option value="${item.id}" ${item.id === selected ? 'selected' : ''}>${escape(item.name)}</option>`).join('');
}

function effective(product, regionId) {
  const variant = product?.variants?.[regionId];
  return { caption: variant?.caption || product?.caption || '', images: variant?.images?.length ? variant.images : product?.images || [] };
}

function imageMarkup(images, controls = false, scope = '') {
  return images.map((name, index) => `<div class="image-tile"><img src="/uploads/${encodeURIComponent(name)}" alt="Ảnh ${index + 1}">${controls ? `<div class="image-tools"><button data-image-action="up" data-scope="${scope}" data-index="${index}" title="Lên">↑</button><button data-image-action="down" data-scope="${scope}" data-index="${index}" title="Xuống">↓</button><button data-image-action="remove" data-scope="${scope}" data-index="${index}" title="Bỏ khỏi bài">×</button></div>` : ''}</div>`).join('');
}

function renderProducts() {
  $('#product-list').innerHTML = state.products.length ? state.products.map(product => `<div class="list-item"><div><strong>${escape(product.name)}</strong><small>${product.images.length} ảnh mặc định · ${Object.keys(product.variants || {}).length} khu vực tùy chỉnh</small></div><div class="item-actions"><button data-product-edit="${product.id}">Sửa</button><button class="remove" data-product-delete="${product.id}">Xóa</button></div></div>`).join('') : '<p class="muted">Chưa có mặt hàng.</p>';
  const product = state.products.find(p => p.id === editingProduct);
  $('#product-form-title').textContent = product ? `Sửa: ${product.name}` : 'Mặt hàng mới';
  $('#product-name').value = product?.name || '';
  $('#product-caption').value = product?.caption || '';
  $('#product-assets').hidden = !product;
  $('#product-images').innerHTML = product ? imageMarkup(product.images, true, 'base') : '';
  $('#variant-region').innerHTML = optionList(state.regions, selectedVariantRegion, 'Chưa có khu vực');
  renderVariant();
}

function renderVariant() {
  const product = state.products.find(p => p.id === editingProduct);
  const variant = product?.variants?.[selectedVariantRegion];
  $('#variant-caption').value = variant?.caption || '';
  $('#variant-images').innerHTML = variant?.images?.length ? imageMarkup(variant.images, true, 'variant') : '<p class="muted">Đang dùng ảnh mặc định.</p>';
  $('#save-variant').disabled = !product || !selectedVariantRegion;
  $('#variant-upload').disabled = !product || !selectedVariantRegion;
}

function renderRegions() {
  $('#region-list').innerHTML = state.regions.length ? state.regions.map(region => `<div class="list-item"><div><strong>${escape(region.name)}</strong><small>${region.groups.length} group</small></div><div class="item-actions"><button data-region-edit="${region.id}">Sửa</button><button class="remove" data-region-delete="${region.id}">Xóa</button></div></div>`).join('') : '<p class="muted">Chưa có khu vực.</p>';
  const region = state.regions.find(r => r.id === editingRegion);
  $('#region-form-title').textContent = region ? `Sửa: ${region.name}` : 'Khu vực mới';
  $('#region-name').value = region?.name || '';
  $('#group-manager').hidden = !region;
  $('#group-list').innerHTML = region?.groups.length ? region.groups.map(group => `<div class="group-row"><div><strong>${escape(group.name)}</strong><br><a href="${escape(group.url)}" target="_blank" rel="noopener">${escape(group.url)}</a></div><div class="item-actions"><button data-group-edit="${group.id}">Sửa</button><button class="remove" data-group-delete="${group.id}">Xóa</button></div></div>`).join('') : '<p class="muted">Chưa có group.</p>';
}

function renderPublish() {
  $('#publish-product').innerHTML = optionList(state.products, selectedProduct, 'Chưa có mặt hàng');
  $('#publish-region').innerHTML = optionList(state.regions, selectedRegion, 'Chưa có khu vực');
  const product = state.products.find(p => p.id === selectedProduct);
  const region = state.regions.find(r => r.id === selectedRegion);
  const preview = $('#publish-preview');
  if (!product || !region) {
    preview.className = 'preview empty'; preview.textContent = 'Tạo mặt hàng và khu vực để xem trước bài đăng.';
  } else {
    const content = effective(product, region.id);
    preview.className = 'preview';
    preview.innerHTML = `<strong>${escape(product.name)} → ${escape(region.name)}</strong><div class="caption">${escape(content.caption)}</div><div class="images">${imageMarkup(content.images)}</div><p class="hint">${region.groups.length} group · ${content.images.length} ảnh</p><small>${region.groups.map(group => escape(group.name)).join(' · ')}</small>`;
  }
  $('#dry-run-option').hidden = !state.localPreviewAvailable;
  const dryRun = state.localPreviewAvailable && $('#dry-run').checked;
  $('#start-run').textContent = dryRun ? 'Chạy thử khu vực này' : 'Đăng vào khu vực này';
  $('#run-hint').textContent = dryRun ? 'Playwright sẽ điền bài trong Chromium và dừng trước nút Đăng. Xem xong, bấm Tiếp tục trên giao diện.' : 'Nút này bắt đầu đăng thật. Hãy kiểm tra caption, ảnh và danh sách group trước khi bấm.';
  $('#start-run').disabled = !product || !region?.groups.length || !!state.activeRun;
  const run = state.runs.find(item => item.id === state.activeRun);
  if (!run) { $('#run-progress').textContent = 'Chưa có lượt đăng đang chạy.'; return; }
  const done = run.items.filter(item => ['submitted', 'previewed', 'failed', 'cancelled'].includes(item.status)).length;
  const next = run.nextAt ? Math.max(0, Math.ceil((new Date(run.nextAt).getTime() - Date.now()) / 1000)) : null;
  const previewOpen = run.items.some(item => ['preview', 'preview_error'].includes(item.status));
  $('#run-progress').innerHTML = `<strong>${run.dryRun ? 'Chạy thử · ' : ''}${escape(run.productName)} · ${escape(run.regionName)}</strong><p>${done}/${run.items.length} group đã xử lý${next !== null ? ` · group tiếp theo sau ${next}s` : ''}</p>${run.items.map(item => `<div class="run-row"><span>${escape(item.groupName)}</span><span class="status ${escape(item.status)}">${statusText(item.status)}</span></div>`).join('')}${previewOpen ? '<button id="continue-run" class="primary" style="margin-top:16px">Đã xem xong · Tiếp tục</button> ' : ''}<button id="stop-run" class="danger" style="margin-top:16px">Dừng sau group hiện tại</button>`;
}

function statusText(status) {
  return ({ starting: 'Đang mở', running: 'Đang xử lý', preview: 'Đang xem thử', preview_error: 'Cần kiểm tra', previewed: 'Đã xem thử', submitted: 'Đã gửi', failed: 'Lỗi', pending: 'Chờ', cancelled: 'Đã bỏ qua', finished: 'Hoàn tất', stopped: 'Đã dừng' })[status] || status;
}

function renderHistory() {
  $('#history-list').innerHTML = state.runs.length ? state.runs.map(run => `<article class="run-card"><div class="run-head"><div><h2>${run.dryRun ? 'Chạy thử · ' : ''}${escape(run.productName)} · ${escape(run.regionName)}</h2><small>${new Date(run.startedAt).toLocaleString('vi-VN')} · ${run.items.length} group</small></div><span class="status ${escape(run.status)}">${statusText(run.status)}</span></div><details><summary>Xem nội dung và kết quả</summary><p class="caption">${escape(run.caption)}</p><div class="images">${imageMarkup(run.images)}</div>${run.error ? `<p class="status failed">${escape(run.error)}</p>` : ''}${run.items.map(item => `<div class="run-row"><span><strong>${escape(item.groupName)}</strong><br><small>${escape(item.message || '')}</small></span><span class="status ${escape(item.status)}">${statusText(item.status)}</span></div>`).join('')}</details></article>`).join('') : '<div class="card muted">Chưa có lượt đăng nào.</div>';
}

document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach(tab => tab.classList.toggle('active', tab === button));
  document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.id === button.dataset.tab));
}));

$('#new-product').addEventListener('click', () => { editingProduct = null; renderProducts(); });
$('#product-form').addEventListener('submit', event => act(async () => {
  event.preventDefault();
  const body = { name: $('#product-name').value, caption: $('#product-caption').value };
  const product = await api(editingProduct ? `/products/${editingProduct}` : '/products', { method: editingProduct ? 'PUT' : 'POST', body });
  editingProduct = product.id; selectedProduct = product.id; await refresh(); notice('Đã lưu mặt hàng.');
}));

$('#product-list').addEventListener('click', event => act(async () => {
  const edit = event.target.closest('[data-product-edit]');
  const remove = event.target.closest('[data-product-delete]');
  if (edit) { editingProduct = edit.dataset.productEdit; renderProducts(); }
  if (remove && confirm('Xóa mặt hàng này? Lịch sử đăng vẫn được giữ.')) {
    await api(`/products/${remove.dataset.productDelete}`, { method: 'DELETE' });
    if (editingProduct === remove.dataset.productDelete) editingProduct = null;
    await refresh(); notice('Đã xóa mặt hàng.');
  }
}));

async function uploadImages(files, regionId = '') {
  if (!editingProduct || !files.length) return;
  const form = new FormData();
  for (const file of files) form.append('images', file);
  await api(`/products/${editingProduct}/images${regionId ? `?regionId=${encodeURIComponent(regionId)}` : ''}`, { method: 'POST', body: form });
  await refresh(); notice(`Đã thêm ${files.length} ảnh.`);
}
$('#product-upload').addEventListener('change', event => act(async () => { await uploadImages(event.target.files); event.target.value = ''; }));
$('#variant-upload').addEventListener('change', event => act(async () => { await uploadImages(event.target.files, selectedVariantRegion); event.target.value = ''; }));
$('#variant-region').addEventListener('change', event => { selectedVariantRegion = event.target.value; renderVariant(); });
$('#save-variant').addEventListener('click', () => act(async () => {
  await api(`/products/${editingProduct}/variants/${selectedVariantRegion}`, { method: 'PUT', body: { caption: $('#variant-caption').value } });
  await refresh(); notice('Đã lưu caption khu vực.');
}));

async function changeImages(event, scope) {
  const button = event.target.closest('[data-image-action]');
  if (!button || button.dataset.scope !== scope) return;
  const product = state.products.find(p => p.id === editingProduct);
  const regionId = scope === 'variant' ? selectedVariantRegion : '';
  const images = [...(regionId ? product.variants?.[regionId]?.images || [] : product.images)];
  const index = Number(button.dataset.index);
  const action = button.dataset.imageAction;
  if (action === 'remove') images.splice(index, 1);
  if (action === 'up' && index > 0) [images[index - 1], images[index]] = [images[index], images[index - 1]];
  if (action === 'down' && index < images.length - 1) [images[index + 1], images[index]] = [images[index], images[index + 1]];
  await api(`/products/${editingProduct}/images`, { method: 'PUT', body: { images, regionId } });
  await refresh();
}
$('#product-images').addEventListener('click', event => act(() => changeImages(event, 'base')));
$('#variant-images').addEventListener('click', event => act(() => changeImages(event, 'variant')));

$('#new-region').addEventListener('click', () => { editingRegion = null; renderRegions(); });
$('#region-form').addEventListener('submit', event => act(async () => {
  event.preventDefault();
  const region = await api(editingRegion ? `/regions/${editingRegion}` : '/regions', { method: editingRegion ? 'PUT' : 'POST', body: { name: $('#region-name').value } });
  editingRegion = region.id; selectedRegion = region.id; selectedVariantRegion = region.id;
  await refresh(); notice('Đã lưu khu vực.');
}));

$('#region-list').addEventListener('click', event => act(async () => {
  const edit = event.target.closest('[data-region-edit]');
  const remove = event.target.closest('[data-region-delete]');
  if (edit) { editingRegion = edit.dataset.regionEdit; renderRegions(); }
  if (remove && confirm('Xóa khu vực và danh sách group trong khu vực này?')) {
    await api(`/regions/${remove.dataset.regionDelete}`, { method: 'DELETE' });
    if (editingRegion === remove.dataset.regionDelete) editingRegion = null;
    await refresh(); notice('Đã xóa khu vực.');
  }
}));

$('#group-form').addEventListener('submit', event => act(async () => {
  event.preventDefault();
  await api(`/regions/${editingRegion}/groups`, { method: 'POST', body: { name: $('#group-name').value, url: $('#group-url').value } });
  $('#group-form').reset(); await refresh(); notice('Đã thêm group.');
}));

$('#group-list').addEventListener('click', event => act(async () => {
  const edit = event.target.closest('[data-group-edit]');
  const remove = event.target.closest('[data-group-delete]');
  const region = state.regions.find(r => r.id === editingRegion);
  if (edit) {
    const group = region.groups.find(g => g.id === edit.dataset.groupEdit);
    const name = prompt('Tên group', group.name);
    if (name === null) return;
    const url = prompt('Link group', group.url);
    if (url === null) return;
    await api(`/regions/${editingRegion}/groups/${group.id}`, { method: 'PUT', body: { name, url } });
    await refresh(); notice('Đã sửa group.');
  }
  if (remove && confirm('Xóa group khỏi khu vực này?')) {
    await api(`/regions/${editingRegion}/groups/${remove.dataset.groupDelete}`, { method: 'DELETE' });
    await refresh(); notice('Đã xóa group.');
  }
}));

$('#publish-product').addEventListener('change', event => { selectedProduct = event.target.value; renderPublish(); });
$('#publish-region').addEventListener('change', event => { selectedRegion = event.target.value; renderPublish(); });
$('#dry-run').addEventListener('change', renderPublish);
$('#start-run').addEventListener('click', () => act(async () => {
  const region = state.regions.find(r => r.id === selectedRegion);
  const product = state.products.find(p => p.id === selectedProduct);
  const dryRun = state.localPreviewAvailable && $('#dry-run').checked;
  if (!dryRun && !confirm(`Đăng thật bài “${product.name}” vào ${region.groups.length} group thuộc ${region.name}?`)) return;
  await api('/runs', { method: 'POST', body: { productId: product.id, regionId: region.id, dryRun } });
  await refresh(false); notice(dryRun ? 'Đã bắt đầu chạy thử. Chromium sẽ mở và không bấm Đăng.' : 'Đã bắt đầu lượt đăng. Chromium sẽ mở trên máy Mac.');
}));
$('#run-progress').addEventListener('click', event => act(async () => {
  if (event.target.id === 'continue-run') {
    await api(`/runs/${state.activeRun}/continue`, { method: 'POST' });
    notice('Đã kết thúc bản xem thử hiện tại.');
    return;
  }
  if (event.target.id !== 'stop-run') return;
  await api(`/runs/${state.activeRun}/stop`, { method: 'POST' }); notice('Đã yêu cầu dừng sau group hiện tại.');
}));

refresh().catch(err => notice(err.message, true));
setInterval(() => refresh(false).catch(() => {}), 2000);
