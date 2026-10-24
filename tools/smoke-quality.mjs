// Starts a match at each quality preset and fails on console errors. Usage: node tools/smoke-quality.mjs [url] [preset...]
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:3000';
const presets = process.argv.slice(3).length ? process.argv.slice(3) : ['low', 'medium', 'high', 'epic'];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const q of presets) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((id) => localStorage.setItem('twoweeks.settings.v1', JSON.stringify({ quality: id, showPerf: true })), q);
  await page.reload({ waitUntil: 'load' });
  await page.click('#play-btn');
  await page.waitForFunction(() => window.__game && window.__game.running, null, { timeout: 120000 });
  await page.waitForTimeout(q === 'epic' ? 9000 : 5000);
  const info = await page.evaluate(() => { const g = window.__game; return { q: g.quality.id, post: !!g.post, perf: document.getElementById('perf').textContent, scale: g.perf.scale }; });
  console.log(q, info, errors);
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}-${q}.png` });
  if (errors.length || info.q !== q || (q === 'epic' && !info.post)) bad++;
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
