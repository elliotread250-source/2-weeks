// Two headless browsers join the same online room and play a little. Usage:
//   LOBBY_SECONDS=2 MAX_PLAYERS_PER_ROOM=12 HUMAN_TARGET=2 PORT=3112 node server.js &
//   node tools/smoke-online.mjs http://localhost:3112
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://localhost:3000';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errors = [];
async function player(name) {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`${name}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.setItem('twoweeks.settings.v1', JSON.stringify({ shadows: false, detail: 'low' })); });
  await page.fill('#player-name', name);
  await page.click('#online-btn');
  return page;
}
const a = await player('alice');
const b = await player('bob');
for (const p of [a, b]) await p.waitForFunction(() => window.__game && window.__game.running, null, { timeout: 90000 });
console.log('both in match');
await a.waitForTimeout(2500); // bus doors open at 1.5 s

// Alice jumps, then dives forward.
await a.evaluate(() => { const i = window.__game.input; i.down('Space'); i.up('Space'); i.pitch = -1; });
await a.waitForFunction(() => window.__game.player.state === 'skydive' || window.__game.player.state === 'glide', null, { timeout: 60000 });
await a.evaluate(() => { window.__game.input.down('KeyW'); });
await a.waitForTimeout(6000);
const seenByBob = await b.evaluate((aliceName) => {
  const g = window.__game;
  const alice = g.match.fighters.find((f) => f.name === aliceName);
  return { alice: alice && { state: alice.state, y: Math.round(alice.pos.y), hidden: !!alice.hidden }, bobState: g.player.state, rtt: Math.round(g.host.rtt) };
}, 'alice');
const aStats = await a.evaluate(() => ({ ...window.__game.host.stats, state: window.__game.player.state, y: Math.round(window.__game.player.pos.y), pending: window.__game.host.pending.length }));
console.log('bob sees alice:', seenByBob);
console.log('alice prediction stats:', aStats);
if (process.argv[3]) await a.screenshot({ path: process.argv[3] });
await browser.close();
if (errors.length) { console.error('console errors:\n' + errors.join('\n')); process.exit(1); }
if (!seenByBob.alice || seenByBob.alice.state === 'bus') { console.error('bob never saw alice leave the bus'); process.exit(1); }
console.log('online smoke ok');
