// Shared Playwright helpers for the browser scripts (screenshot, accessibility, offline check).
// Chromium comes from /opt/pw-browsers or PLAYWRIGHT_CHROMIUM_EXECUTABLE; nothing is downloaded.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';

export const BASE_PATH = '/WCA_2030_Explorer/';

function chromiumPath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!fs.existsSync(root)) return undefined;
  const dir = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
  const exe = dir ? path.join(root, dir, 'chrome-linux', 'chrome') : '';
  return exe && fs.existsSync(exe) ? exe : undefined;
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
}

/** Serve the built site (docs/) with `vite preview` for the duration of `run`. */
export async function withPreview<T>(run: (baseUrl: string) => Promise<T>, port = 4174): Promise<T> {
  const server: ChildProcess = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' });
  const baseUrl = `http://localhost:${port}${BASE_PATH}`;
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(baseUrl)).ok) break; } catch { /* not up yet */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return await run(baseUrl);
  } finally {
    server.kill();
  }
}

/** Open the app and wait until the index has loaded (loading overlay hidden). */
export async function openApp(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl);
  await page.waitForFunction(() => {
    const overlay = document.querySelector('.loading-overlay') as HTMLElement | null;
    return !overlay || getComputedStyle(overlay).display === 'none';
  }, null, { timeout: 120_000 });
}

export async function search(page: Page, query: string): Promise<void> {
  await page.fill('.search-input, input[type="search"]', query);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#wca-results .result-card, #wca-results .not-found-card', { timeout: 30_000 });
  await page.waitForTimeout(300);
}
