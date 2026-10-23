// Opens the locker, equips things, checks the preview and grid render, then
// starts an offline match with the chosen loadout. Usage: node tools/smoke-locker.mjs [url]
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://localhost:3000';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.click('#locker-btn');
await page.waitForSelector('#locker-grid .tile', { timeout: 30000 });
const tiles = await page.$$eval('#locker-grid .tile', (t) => t.length);
await page.click('#locker-slots [data-slot="pickaxe"]');
await page.click('#locker-grid .tile:not(.locked)');
await page.click('#locker-slots [data-slot="emote2"]');
const locked = await page.$$eval('#locker-grid .tile.locked', (t) => t.length);
await page.waitForTimeout(6000);
await page.screenshot({ path: process.env.SHOT || 'locker.png' });
await page.click('#locker-close');
await page.click('#shop-btn'); await page.waitForSelector('#shop-body .shop-msg'); await page.click('#shop-close');
await page.click('#chal-btn'); await page.waitForSelector('#chal-body .shop-msg'); await page.click('#chal-close');
await page.click('#play-btn');
await page.waitForFunction(() => window.__game && window.__game.running, null, { timeout: 90000 });
const lo = await page.evaluate(() => window.__game.player.loadout || null);
console.log({ tiles, locked, loadout: lo && lo.outfit, errors });
await browser.close();
if (errors.length) process.exit(1);
