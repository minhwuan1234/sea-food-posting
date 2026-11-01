import { $, api, act } from '../components/shared.js';
import { runCard, runDetail } from '../components/run-card.js';

export async function mountHistory() {
  let offset = 0;
  let total = 0;
  const pageSize = 20;
  const details = new Map();

  async function refresh() {
    const result = await api(`/runs?offset=${offset}&limit=${pageSize}`);
    total = result.total;
    $('#history-list').innerHTML = result.items.length ? result.items.map(run => runCard(run, details.get(run.id))).join('') : '<div class="empty-state">Chưa có lượt đăng nào.</div>';
    $('#history-pager').innerHTML = total ? `<button data-history-page="prev" ${offset === 0 ? 'disabled' : ''}>← Trước</button><span>${offset + 1}–${Math.min(offset + pageSize, total)} / ${total}</span><button data-history-page="next" ${offset + pageSize >= total ? 'disabled' : ''}>Sau →</button>` : '';
  }
  await refresh();
  $('#history-list').addEventListener('toggle', event => act(async () => {
    const node = event.target;
    if (!node.matches('details[data-run-id]') || !node.open || details.has(node.dataset.runId)) return;
    const run = await api(`/runs/${node.dataset.runId}`);
    details.set(run.id, run);
    node.querySelector('.run-detail').innerHTML = runDetail(run);
  }), true);
  $('#history-pager').addEventListener('click', event => act(async () => {
    const direction = event.target.closest('[data-history-page]')?.dataset.historyPage;
    if (!direction) return;
    offset = direction === 'next' ? offset + pageSize : Math.max(0, offset - pageSize);
    await refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
}
