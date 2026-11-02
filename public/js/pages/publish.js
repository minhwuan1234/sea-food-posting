import { $, api, act, notice, optionList } from '../components/shared.js';
import { productPreview } from '../components/product-preview.js';
import { runProgress } from '../components/run-progress.js';

export async function mountPublish() {
  let products = [];
  let regions = [];
  let product = null;
  let region = null;
  let activeRun = null;
  let localPreviewAvailable = false;
  let workerOnline = false;
  let selectedProduct = '';
  let selectedRegion = '';
  let previewProduct = null;
  let previewRegion = null;

  function render() {
    $('#publish-product').innerHTML = optionList(products, selectedProduct, 'Chưa có mặt hàng');
    $('#publish-region').innerHTML = optionList(regions, selectedRegion, 'Chưa có khu vực');
    if (previewProduct !== product || previewRegion !== region) {
      $('#publish-preview').innerHTML = productPreview(product, region);
      previewProduct = product; previewRegion = region;
    }
    $('#dry-run-option').hidden = !localPreviewAvailable;
    $('#worker-status').hidden = localPreviewAvailable;
    $('#worker-status').textContent = workerOnline ? '● Worker Mac đã kết nối' : '○ Worker Mac chưa kết nối. Mở Terminal trong repo và chạy npm run worker.';
    $('#worker-status').classList.toggle('online', workerOnline);
    const dryRun = localPreviewAvailable && $('#dry-run').checked;
    $('#start-run').textContent = dryRun ? 'Chạy thử khu vực này' : 'Đăng vào khu vực này';
    $('#run-hint').textContent = dryRun ? 'Playwright điền bài rồi dừng trước nút Đăng để bạn kiểm tra trong Chromium.' : workerOnline || localPreviewAvailable ? 'Nút này bắt đầu đăng thật. Hãy kiểm tra nội dung và danh sách group trước khi bấm.' : 'Khởi động worker trên Mac trước khi đăng.';
    $('#start-run').disabled = !product || !region?.groups.length || !!activeRun || (!localPreviewAvailable && !workerOnline);
    $('#run-progress').innerHTML = runProgress(activeRun);
  }
  async function refreshActive() {
    const active = await api('/active-run');
    activeRun = active.run; localPreviewAvailable = active.localPreviewAvailable; workerOnline = active.workerOnline;
    render();
  }
  [products, regions] = await Promise.all([api('/products'), api('/regions')]);
  selectedProduct = products[0]?.id || '';
  selectedRegion = regions[0]?.id || '';
  [product, region] = await Promise.all([
    selectedProduct ? api(`/products/${selectedProduct}`) : null,
    selectedRegion ? api(`/regions/${selectedRegion}`) : null
  ]);
  await refreshActive();

  $('#publish-product').addEventListener('change', event => act(async () => {
    selectedProduct = event.target.value;
    product = selectedProduct ? await api(`/products/${selectedProduct}`) : null;
    render();
  }));
  $('#publish-region').addEventListener('change', event => act(async () => {
    selectedRegion = event.target.value;
    region = selectedRegion ? await api(`/regions/${selectedRegion}`) : null;
    render();
  }));
  $('#dry-run').addEventListener('change', render);
  $('#start-run').addEventListener('click', () => act(async () => {
    const dryRun = localPreviewAvailable && $('#dry-run').checked;
    if (!dryRun && !confirm(`Đăng thật bài “${product.name}” vào ${region.groups.length} group thuộc ${region.name}?`)) return;
    await api('/runs', { method: 'POST', body: { productId: product.id, regionId: region.id, dryRun } });
    await refreshActive();
    notice(dryRun ? 'Đã bắt đầu chạy thử. Chromium sẽ không bấm Đăng.' : 'Đã bắt đầu lượt đăng.');
  }));
  $('#run-progress').addEventListener('click', event => act(async () => {
    if (event.target.id === 'continue-run') {
      await api(`/runs/${activeRun.id}/continue`, { method: 'POST' });
      notice('Đã kết thúc bản xem thử hiện tại.');
      return;
    }
    if (event.target.id === 'stop-run') {
      await api(`/runs/${activeRun.id}/stop`, { method: 'POST' });
      notice('Đã yêu cầu dừng sau group hiện tại.');
    }
  }));
  setInterval(() => refreshActive().catch(() => {}), 2000);
}
