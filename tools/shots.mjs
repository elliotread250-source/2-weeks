// Renders poses from the character viewer to PNGs: node tools/shots.mjs outDir clip@t[:gun] ...
import { chromium } from 'playwright-core';
const [, , outDir, ...specs] = process.argv;
const url = process.env.VIEWER_URL || 'http://localhost:3000/viewer.html';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 420, height: 520 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.viewer);
for (const spec of specs) {
  const [clipT, gun = 'none', outfit = '0'] = spec.split(':');
  const [clip, t = '0'] = clipT.split('@');
  await page.evaluate(([c, tt, g, o]) => { window.viewer.load(Number(o)); window.viewer.setGun(g); window.viewer.freeze(c, Number(tt)); }, [clip, t, gun, outfit]);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/${clip.replace(/\W/g, '_')}_${t}_${gun}_${outfit}.png` });
}
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
