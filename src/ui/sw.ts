// Service-worker concerns: offline status dot, index-version handshake (B5), update banner (E3: split out of App.ts).
import { runVersionHandshake } from '../engine/index-version';
import { showUpdateBanner } from './update-banner';

export function initOfflineStatus(statusEl: HTMLElement): () => void {
  const dot   = statusEl.querySelector<HTMLElement>('.status-dot')!;
  const label = statusEl.querySelector<HTMLElement>('.status-label')!;

  // Initial state: engine not yet loaded
  dot.className     = 'status-dot status-dot--loading';
  label.textContent = 'Preparing offline index';

  const refresh = () => {
    const active = !!(navigator.serviceWorker?.controller);
    dot.className     = `status-dot status-dot--${active ? 'online' : 'idle'}`;
    label.textContent = active ? 'Offline ready' : 'Online — first setup pending';
  };

  navigator.serviceWorker?.addEventListener('controllerchange', refresh);
  return refresh;
}

export async function checkIndexVersion(root: HTMLElement): Promise<void> {
  const check = await runVersionHandshake({
    baseUrl:  import.meta.env.BASE_URL,
    fetchFn:  fetch.bind(globalThis),
    storage:  localStorage,
    caches:   typeof caches === 'undefined' ? undefined : caches,
  });
  if (check?.status === 'changed') showUpdateBanner(root);
}

export function initSWUpdateBanner(root: HTMLElement): void {
  if (!navigator.serviceWorker) return;

  // The first install also fires controllerchange (clients.claim); that is not an update.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showUpdateBanner(root);
  });
}
