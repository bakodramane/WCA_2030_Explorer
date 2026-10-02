// Dev probe (E1): which ONNX-runtime WASM file does the app request in this browser, with and without SIMD?
import { chromium } from 'playwright-core';
import { openApp, withPreview } from '../lib/browser';
import fs from 'node:fs';
const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
const exe = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().pop()!;
await withPreview(async base => {
  for (const [label, args] of [['default', []], ['no SIMD', ['--js-flags=--no-experimental-wasm-simd']]] as const) {
    const browser = await chromium.launch({ executablePath: `${root}/${exe}/chrome-linux/chrome`, args: ['--no-sandbox', ...args] });
    const page = await (await browser.newContext()).newPage();
    const wasm: string[] = [];
    page.on('request', r => { if (r.url().endsWith('.wasm')) wasm.push(r.url().split('/').pop()!); });
    await openApp(page, base);
    console.log(label, JSON.stringify({ requested: [...new Set(wasm)], crossOriginIsolated: await page.evaluate(() => (self as unknown as { crossOriginIsolated: boolean }).crossOriginIsolated) }));
    await browser.close();
  }
}, 4176);
