// D1: screenshots of the home and result views at desktop and phone size, and the check that the
// top of the first result card sits above the fold (1280×900: y < 300; 390×844: y < 360).
//   npm run build && npx tsx scripts/screenshot.ts [--out <dir>] [--check]
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, openApp, search, withPreview } from './lib/browser';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900, limit: 300 },
  { name: 'phone', width: 390, height: 844, limit: 360 },
];
const QUERIES = ['How is a plot related to a field and a parcel?', 'fallow'];

async function main(): Promise<void> {
  const outDir = path.resolve(arg('out', path.join('reports', 'screenshots')));
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await launchBrowser();
  const failures: string[] = [];
  const report: unknown[] = [];

  await withPreview(async baseUrl => {
    for (const vp of VIEWPORTS) {
      for (const [i, query] of QUERIES.entries()) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await context.newPage();
        await openApp(page, baseUrl);
        if (i === 0) await page.screenshot({ path: path.join(outDir, `${vp.name}-home.png`) });
        await search(page, query);
        const top = await page.evaluate(() => {
          const card = document.querySelector('#wca-results .result-card, #wca-results .not-found-card');
          return card ? Math.round(card.getBoundingClientRect().top + window.scrollY) : -1;
        });
        await page.screenshot({ path: path.join(outDir, `${vp.name}-result-${i + 1}.png`) });
        report.push({ viewport: vp.name, query, firstCardTop: top, limit: vp.limit });
        if (top < 0 || top >= vp.limit) failures.push(`${vp.name} "${query}": first card at y=${top}, limit ${vp.limit}`);
        await context.close();
      }
    }
  });
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  console.log(failures.length ? `ABOVE-THE-FOLD CHECK FAILED:\n  ${failures.join('\n  ')}` : 'Above-the-fold check passed.');
  if (process.argv.includes('--check') && failures.length) process.exitCode = 1;
}

main().catch(error => { console.error('Fatal:', error); process.exitCode = 1; });
