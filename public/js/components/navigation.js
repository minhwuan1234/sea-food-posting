export const paths = { publish: '/dang-bai', products: '/mat-hang', regions: '/khu-vuc', history: '/lich-su' };

export function mountNavigation() {
  const page = Object.keys(paths).find(key => paths[key] === location.pathname) || 'publish';
  document.querySelectorAll('[data-tab]').forEach(link => {
    const active = link.dataset.tab === page;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
  });
  document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.id === page));
  return page;
}
