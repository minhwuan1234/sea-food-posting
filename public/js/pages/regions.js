import { $, api, act, notice, escape } from '../components/shared.js';
import { regionList } from '../components/catalog-list.js';

export async function mountRegions() {
  let regions = [];
  let region = null;
  let editingRegion = null;

  function render() {
    $('#region-list').innerHTML = regionList(regions);
    $('#region-form-title').textContent = region ? `Chỉnh sửa ${region.name}` : 'Khu vực mới';
    $('#region-name').value = region?.name || '';
    $('#group-manager').hidden = !region;
    $('#group-list').innerHTML = region?.groups.length ? region.groups.map(group => `<div class="group-row"><div class="group-branch"><span class="tree-icon">└</span><div><strong>${escape(group.name)}</strong><a href="${escape(group.url)}" target="_blank" rel="noopener">${escape(group.url)}</a></div></div><div class="item-actions"><button data-group-edit="${group.id}">Sửa</button><button class="remove" data-group-delete="${group.id}">Xóa</button></div></div>`).join('') : '<div class="empty-state small">Khu vực này chưa có group.</div>';
  }
  async function refresh() {
    regions = await api('/regions');
    if (!regions.some(item => item.id === editingRegion)) editingRegion = null;
    region = editingRegion ? await api(`/regions/${editingRegion}`) : null;
    render();
  }
  await refresh();

  $('#new-region').addEventListener('click', () => { editingRegion = null; region = null; render(); $('#region-name').focus(); });
  $('#region-form').addEventListener('submit', event => act(async () => {
    event.preventDefault();
    const saved = await api(editingRegion ? `/regions/${editingRegion}` : '/regions', { method: editingRegion ? 'PUT' : 'POST', body: { name: $('#region-name').value } });
    editingRegion = saved.id; await refresh(); notice('Đã lưu khu vực.');
  }));
  $('#region-list').addEventListener('click', event => act(async () => {
    const edit = event.target.closest('[data-region-edit]');
    const remove = event.target.closest('[data-region-delete]');
    if (edit) { editingRegion = edit.dataset.regionEdit; region = await api(`/regions/${editingRegion}`); render(); $('#region-form-title').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
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
    if (edit) {
      const group = region.groups.find(item => item.id === edit.dataset.groupEdit);
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
}
