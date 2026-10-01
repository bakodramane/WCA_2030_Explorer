// D4: axe-core on the home view, a result view, a refusal view, and every modal (desktop and 360 px),
// plus tap-target size (>= 44x44 px), horizontal overflow, and filter-pill scrolling at phone width.
//   npm run build && npm run a11y
import AxeBuilder from '@axe-core/playwright';
import type { Page } from 'playwright-core';
import { launchBrowser, openApp, search, withPreview } from './lib/browser';

const DESKTOP_MODALS = ['Guided learning path', 'Test yourself', 'Glossary', 'Questions bank', 'Essential items', 'Additional items', 'Explore by theme'];
/** Phone: the same content reached through the Learn and Browse hubs. */
const PHONE_MODALS = ['Guided learning path', 'Test yourself', 'Glossary', 'Questions bank', 'Items catalogue', 'Explore by theme', 'Figures and tables'];
const problems: string[] = [];
let views = 0;

async function axe(page: Page, label: string): Promise<void> {
  views++;
  await page.waitForTimeout(700); // let entry animations finish (axe would read a half-faded colour)
  const { violations } = await new AxeBuilder({ page }).analyze();
  for (const v of violations.filter(x => x.impact === 'serious' || x.impact === 'critical')) {
    problems.push(`${label}: axe ${v.impact} ${v.id} on ${v.nodes.length} node(s), e.g. ${v.nodes[0].target.join(' ')} — ${v.help}`);
    if (process.env.A11Y_VERBOSE) for (const n of v.nodes) console.log(`   [${label}] ${v.id} ${n.target.join(' ')} :: ${(n.any[0]?.message ?? '').slice(0, 160)}`);
  }
}

/** Visible controls smaller than 44x44 px (inline links inside running text are exempt, as in WCAG 2.5.8). */
async function tapTargets(page: Page, label: string): Promise<void> {
  const small = await page.evaluate(() => {
    const out: string[] = [];
    const scope: ParentNode = document.querySelector('.modal-panel') ?? document; // behind a modal only the modal is reachable
    for (const e of scope.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [role="button"]')) {
      const r = e.getBoundingClientRect();
      const style = getComputedStyle(e);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden' || style.display === 'none') continue;
      if (e.tagName === 'A' && e.closest('p, li, blockquote') && !e.classList.contains('pdf-link') && !e.classList.contains('footer-link')) continue;
      if (e.closest('[hidden]') || e.classList.contains('sr-only')) continue;
      if (r.width < 43.5 || r.height < 43.5) out.push(`${e.tagName.toLowerCase()}.${e.className.toString().split(' ')[0]} ${Math.round(r.width)}×${Math.round(r.height)} "${(e.textContent || '').trim().slice(0, 24)}"`);
    }
    return out;
  });
  if (small.length) problems.push(`${label}: ${small.length} tap target(s) under 44×44 px: ${small.slice(0, 4).join('; ')}`);
}

async function overflow(page: Page, label: string): Promise<void> {
  const wide = await page.evaluate(() => {
    const doc = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const panel = document.querySelector<HTMLElement>('.modal-panel');
    return { doc, panel: !!panel && panel.scrollWidth > panel.clientWidth + 1 };
  });
  if (wide.doc) problems.push(`${label}: page scrolls horizontally`);
  if (wide.panel) problems.push(`${label}: modal content is wider than its panel`);
}

async function closeModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

/** Open a modal by its action button (desktop) or through the Learn/Browse hub (phone). */
async function openModal(page: Page, label: string, phone: boolean): Promise<void> {
  if (!phone) { await page.getByRole('button', { name: label, exact: true }).first().click(); }
  else {
    const hub = ['Guided learning path', 'Test yourself', 'Glossary'].includes(label) ? 'Learn' : 'Browse';
    await page.locator('.hub-buttons .browse-btn', { hasText: hub }).click();
    await page.locator('.modal-panel').waitFor();
    await axe(page, `phone ${hub} hub`); await tapTargets(page, `phone ${hub} hub`); await overflow(page, `phone ${hub} hub`);
    await page.locator('.hub-choice-row', { hasText: label }).first().click();
  }
  await page.waitForSelector('.modal-panel');
  await page.waitForTimeout(250);
}

async function run(baseUrl: string): Promise<void> {
  const browser = await launchBrowser();
  for (const [name, width, height] of [['desktop', 1280, 900], ['phone', 360, 740]] as const) {
    const phone = name === 'phone';
    const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
    page.setDefaultTimeout(10_000);
    await openApp(page, baseUrl);
    console.log(`${name}: app open`);
    await axe(page, `${name} home`); await tapTargets(page, `${name} home`); await overflow(page, `${name} home`);
    for (const label of phone ? PHONE_MODALS : DESKTOP_MODALS) {
      console.log(`${name}: ${label}`);
      await openModal(page, label, phone);
      await axe(page, `${name} modal "${label}"`); await tapTargets(page, `${name} modal "${label}"`); await overflow(page, `${name} modal "${label}"`);
      await closeModal(page);
      if (phone) await closeModal(page);
    }
    await search(page, 'holder');
    await axe(page, `${name} result view`); await tapTargets(page, `${name} result view`); await overflow(page, `${name} result view`);
    await search(page, 'What is the capital of France?');
    await axe(page, `${name} refusal view`); await tapTargets(page, `${name} refusal view`); await overflow(page, `${name} refusal view`);
    if (phone) {
      for (const q of ['census frame', 'land tenure', 'questionnaire', 'reference period']) {
        await search(page, q);
        if (await page.locator('.filter-bar').count()) break;
      }
      await tapTargets(page, 'phone filtered result view');
      const pills = await page.evaluate(() => {
        const bar = document.querySelector<HTMLElement>('.filter-bar');
        return bar ? { overflowX: getComputedStyle(bar).overflowX, scrolls: bar.scrollWidth > bar.clientWidth } : null;
      });
      if (!pills) problems.push('phone: no filter bar found to check');
      else if (!['auto', 'scroll'].includes(pills.overflowX)) problems.push('phone filter pills do not scroll horizontally (overflow-x is not auto/scroll)');
      console.log(`filter pills at 360 px: ${JSON.stringify(pills)}`);
    }
    await page.context().close();
  }
  await browser.close();
}

withPreview(run).then(() => {
  console.log(`Audited ${views} views.`);
  if (problems.length) { console.log(`PROBLEMS (${problems.length}):\n  ${problems.join('\n  ')}`); process.exitCode = 1; }
  else console.log('No serious or critical axe violations, no small tap targets, no horizontal overflow.');
}).catch(error => { console.error('Fatal:', error); process.exitCode = 1; });
