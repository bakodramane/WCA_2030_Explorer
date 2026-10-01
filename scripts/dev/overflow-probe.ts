// Dev probe: which elements make the page wider than a 360 px phone? (D4 investigation)
import { launchBrowser, openApp, search, withPreview } from '../lib/browser';
const browser = await launchBrowser();
await withPreview(async base => {
  const page = await (await browser.newContext({ viewport: { width: 360, height: 740 } })).newPage();
  await openApp(page, base); await search(page, 'holder');
  console.log(JSON.stringify(await page.evaluate(() => {
    const vw = document.documentElement.clientWidth; const out: string[] = [];
    for (const e of document.querySelectorAll<HTMLElement>('body *')) { const r = e.getBoundingClientRect(); if (r.right > vw + 1 && r.width > 0) out.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} right=${Math.round(r.right)} w=${Math.round(r.width)}`); }
    return { vw, scrollW: document.documentElement.scrollWidth, out: out.slice(0, 12) };
  }), null, 1));
}, 4175);
await browser.close();
