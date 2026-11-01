import { $, api, act, notice, optionList, imageMarkup } from '../components/shared.js';
import { productList } from '../components/catalog-list.js';

export async function mountProducts() {
  let products = [];
  let regions = [];
  let product = null;
  let editingProduct = null;
  let selectedVariantRegion = '';

  function renderVariant() {
    const variant = product?.variants?.[selectedVariantRegion];
    $('#variant-caption').value = variant?.caption || '';
    $('#variant-images').innerHTML = variant?.images?.length ? imageMarkup(variant.images, true, 'variant') : '<p class="muted">Đang dùng ảnh mặc định.</p>';
    $('#save-variant').disabled = !product || !selectedVariantRegion;
    $('#variant-upload').disabled = !product || !selectedVariantRegion;
  }
  function render() {
    $('#product-list').innerHTML = productList(products);
    $('#product-form-title').textContent = product ? `Chỉnh sửa ${product.name}` : 'Mặt hàng mới';
    $('#product-name').value = product?.name || '';
    $('#product-caption').value = product?.caption || '';
    $('#product-assets').hidden = !product;
    $('#product-images').innerHTML = product ? imageMarkup(product.images, true, 'base') : '';
    $('#variant-region').innerHTML = optionList(regions, selectedVariantRegion, 'Chưa có khu vực');
    renderVariant();
  }
  async function refresh() {
    [products, regions] = await Promise.all([api('/products'), api('/regions')]);
    if (!products.some(item => item.id === editingProduct)) editingProduct = null;
    if (!regions.some(item => item.id === selectedVariantRegion)) selectedVariantRegion = regions[0]?.id || '';
    product = editingProduct ? await api(`/products/${editingProduct}`) : null;
    render();
  }
  await refresh();

  $('#new-product').addEventListener('click', () => { editingProduct = null; product = null; render(); $('#product-name').focus(); });
  $('#product-form').addEventListener('submit', event => act(async () => {
    event.preventDefault();
    const body = { name: $('#product-name').value, caption: $('#product-caption').value };
    const saved = await api(editingProduct ? `/products/${editingProduct}` : '/products', { method: editingProduct ? 'PUT' : 'POST', body });
    editingProduct = saved.id; await refresh(); notice('Đã lưu mặt hàng.');
  }));
  $('#product-list').addEventListener('click', event => act(async () => {
    const edit = event.target.closest('[data-product-edit]');
    const remove = event.target.closest('[data-product-delete]');
    if (edit) { editingProduct = edit.dataset.productEdit; product = await api(`/products/${editingProduct}`); render(); $('#product-form-title').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
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
    const regionId = scope === 'variant' ? selectedVariantRegion : '';
    const images = [...(regionId ? product.variants?.[regionId]?.images || [] : product.images)];
    const index = Number(button.dataset.index);
    if (button.dataset.imageAction === 'remove') images.splice(index, 1);
    if (button.dataset.imageAction === 'up' && index > 0) [images[index - 1], images[index]] = [images[index], images[index - 1]];
    if (button.dataset.imageAction === 'down' && index < images.length - 1) [images[index + 1], images[index]] = [images[index], images[index + 1]];
    await api(`/products/${editingProduct}/images`, { method: 'PUT', body: { images, regionId } });
    await refresh();
  }
  $('#product-images').addEventListener('click', event => act(() => changeImages(event, 'base')));
  $('#variant-images').addEventListener('click', event => act(() => changeImages(event, 'variant')));
}
