/** The dismissible "Guidelines index updated" banner (service-worker update or B5 version change). */
export function showUpdateBanner(root: HTMLElement): void {
  if (root.querySelector('.sw-banner')) return;

  const banner = document.createElement('div');
  banner.className = 'sw-banner';
  banner.innerHTML = `
    <span>Guidelines index updated. Reload to apply.</span>
    <button type="button" id="sw-reload-btn">Reload</button>
    <button type="button" id="sw-dismiss-btn">✕</button>`;
  root.appendChild(banner);

  banner.querySelector('#sw-reload-btn')!.addEventListener('click', () => location.reload());
  banner.querySelector('#sw-dismiss-btn')!.addEventListener('click', () => banner.remove());
}
