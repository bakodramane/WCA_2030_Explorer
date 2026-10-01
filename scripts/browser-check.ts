// D3 + definition of done: drives the preview build in Chromium and checks deep links, the PDF page
// link, offline operation, and that no request ever leaves localhost.
//   npm run build && npm run browser-check
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, openApp, search, withPreview } from './lib/browser';

async function main(): Promise<void> {
  const browser = await launchBrowser();
  const checks: Array<[string, boolean, string]> = [];
  const check = (name: string, ok: boolean, detail = ''): void => { checks.push([name, ok, detail]); };
  const sw = fs.readFileSync(path.join('docs', 'sw.js'), 'utf-8');
  check('PDF is in the precache manifest', sw.includes('source/Census-2030_EN-DTP-9.pdf'));
  check('only the SIMD WASM build is precached (threaded builds need cross-origin isolation)', sw.includes('models/ort-wasm-simd.wasm') && !sw.includes('ort-wasm-threaded') && !sw.includes('ort-wasm-simd-threaded') && !/url:"models\/ort-wasm\.wasm"/.test(sw));
  check('embeddings are binary files in the precache', sw.includes('data/embeddings.f32') && sw.includes('data/qa-embeddings.f32'));

  await withPreview(async baseUrl => {
    const context = await browser.newContext();
    const hosts = new Set<string>();
    const wasm = new Set<string>();
    context.on('request', r => { hosts.add(new URL(r.url()).host); if (r.url().endsWith('.wasm')) wasm.add(r.url().split('/').pop()!); });
    const errors: string[] = [];

    // 1. ?q= deep link runs the query on load.
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    await openApp(page, `${baseUrl}?q=fallow`);
    await page.waitForSelector('#wca-results .result-card, #wca-results .not-found-card', { timeout: 30_000 });
    check('deep link ?q=fallow shows results on load', (await page.locator('#wca-results .result-card').count()) > 0);
    check('search box holds the deep-linked query', (await page.inputValue('.search-input, input[type="search"]')) === 'fallow');

    // 2. The URL follows each search without adding history entries.
    const historyBefore = await page.evaluate(() => history.length);
    await search(page, 'holder');
    check('URL updated to ?q=holder', new URL(page.url()).searchParams.get('q') === 'holder', page.url());
    check('replaceState adds no history entry', (await page.evaluate(() => history.length)) === historyBefore);

    // 3. "View page in PDF" points at the PDF page (printed + 14).
    await search(page, 'How is a plot related to a field and a parcel?');
    const href = await page.locator('#wca-results .pdf-link').first().getAttribute('href');
    check('curated card links to PDF page 54 (printed 40 + 14)', !!href && /source\/Census-2030_EN-DTP-9\.pdf#page=54$/.test(href), String(href));

    // 4. Offline: the service worker serves everything, including the PDF, with the network disabled.
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60_000 }).catch(() => undefined);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60_000 });
    await context.setOffline(true);
    await openApp(page, `${baseUrl}?q=land%20tenure`);
    await page.waitForSelector('#wca-results .result-card, #wca-results .not-found-card', { timeout: 30_000 });
    check('offline: search works after reload', (await page.locator('#wca-results .result-card').count()) > 0);
    const pdfStatus = await page.evaluate(async url => { try { return (await fetch(url)).status; } catch { return 0; } }, `${baseUrl}source/Census-2030_EN-DTP-9.pdf`);
    check('offline: the PDF is served from the precache', pdfStatus === 200, String(pdfStatus));
    await context.setOffline(false);

    check('the runtime loaded only ort-wasm-simd.wasm', [...wasm].join() === 'ort-wasm-simd.wasm', [...wasm].join(', '));
    check('no request left localhost', [...hosts].every(h => h.startsWith('localhost')), [...hosts].join(', '));
    check('no page errors', errors.length === 0, errors.join('; '));
    await context.close();
  });
  await browser.close();

  for (const [name, ok, detail] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`);
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
}

main().catch(error => { console.error('Fatal:', error); process.exitCode = 1; });
