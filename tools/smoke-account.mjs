// Browser check of the sign-in flow. Needs the server running with DATABASE_URL set.
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://localhost:3000';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#account-name').textContent.length > 0);
console.log('before:', await page.textContent('#account-name'));
await page.click('#account-btn');
await page.click('#tab-register');
const name = 'Tester' + Math.floor(Math.random() * 9000 + 1000);
await page.fill('#auth-user', name);
await page.fill('#auth-pin', '839204');
await page.click('#auth-submit');
await page.waitForFunction((n) => document.querySelector('#account-name').textContent === n, name);
console.log('signed in as:', await page.textContent('#account-name'), '|', await page.textContent('#account-coins'));
if (process.argv[3]) await page.screenshot({ path: process.argv[3] });
// A weak PIN shows an error rather than failing silently.
await page.click('#account-btn'); // sign out
await page.click('#account-btn');
await page.click('#tab-register');
await page.fill('#auth-user', 'Another1');
await page.fill('#auth-pin', '111111');
await page.click('#auth-submit');
await page.waitForFunction(() => document.querySelector('#auth-error').textContent.length > 0);
console.log('weak pin error:', await page.textContent('#auth-error'));
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('account smoke ok');
