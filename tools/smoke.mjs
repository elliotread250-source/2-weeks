// Headless smoke test: loads the game, starts an offline match, lets it run for
// a few seconds and fails on any console error. Usage: node tools/smoke.mjs [url]
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://localhost:3000';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/api/')) errors.push(`${r.status()} ${r.url()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.click('#play-btn');
await page.waitForFunction(() => window.__game && window.__game.running, null, { timeout: 60000 });
await page.evaluate(() => { localStorage.setItem('twoweeks.settings.v1', JSON.stringify({ shadows: false, detail: 'low' })); });
await page.waitForFunction(() => window.__game.match.tickCount >= 90, null, { timeout: 90000 });
const state = await page.evaluate(() => {
  const g = window.__game;
  return { phase: g.match.phase, time: g.match.time.toFixed(1), alive: g.aliveCount(), tick: g.match.tickCount, paused: g.paused };
});
console.log('state', state);

// Deep scenario: fast-forward the sim by hand (rendering in software is slow)
// while exercising jump, building, editing, shooting and pickaxe paths through
// the real client event handlers.
if (process.argv.includes('--deep')) {
  const result = await page.evaluate(() => {
    const g = window.__game;
    const m = g.match;
    const p = g.player;
    const base = { seq: 0, mx: 0, mz: 0, yaw: 0, pitch: 0, held: 0, act: 0, slot: -1, slotStep: 0, piece: -1, matStep: 0 };
    const A = { JUMP: 1, FIRE: 2, FIRE_UP: 4, INTERACT: 8, RELOAD: 16, BUILD: 32, EDIT: 64, EDIT_RESET: 128, AIM: 256, MAT: 512 };
    const H = { FIRE: 1, AIM: 2, JUMP: 4, SPRINT: 8, INTERACT: 16, FORWARD: 32, CONFIRM_RELEASE: 64 };
    const run = (n, cmdFn) => {
      for (let i = 0; i < n; i++) {
        m.setCommand(p.id, { ...base, seq: m.tickCount, ...cmdFn(i) });
        m.tick();
        g.dispatch(m.takeEvents());
      }
    };
    const log = {};
    run(60, () => ({}));
    run(2, () => ({ act: A.JUMP }));
    run(3000, () => ({ yaw: 1, pitch: -0.5, mz: 1, held: H.FORWARD }));
    log.landed = p.state;
    log.pos = [p.pos.x | 0, p.pos.y | 0, p.pos.z | 0];
    p.mats = { wood: 500, brick: 300, metal: 200 };
    p.slots[0] = { kind: 'weapon', type: 'ar', rarity: 3, mag: 30 };
    p.slots[1] = { kind: 'weapon', type: 'pump', rarity: 2, mag: 5 };
    p.slots[2] = { kind: 'weapon', type: 'rocket', rarity: 4, mag: 1 };
    p.ammo = { light: 100, medium: 200, heavy: 20, shells: 40, rockets: 10 };
    p.hp = 100; p.shield = 100; p.alive = true;
    // Build wall, floor, ramp, cone.
    run(2, () => ({ act: A.BUILD }));
    for (const piece of [0, 1, 2, 3]) {
      run(2, () => ({ piece, yaw: 0.3 * piece }));
      run(12, () => ({ held: H.FIRE, yaw: 0.3 * piece, pitch: -0.2 }));
    }
    log.pieces = m.builds.list.length;
    // Edit a piece.
    run(2, () => ({ act: A.BUILD }));
    run(90, () => ({}));
    const own = m.builds.list.find((b) => b.owner === p);
    if (own) {
      p.pos.set(own.gx * 5 + 2.5, own.baseY + 0.1, own.gz * 5 - 3);
    }
    // Shoot, reload, heal, swing.
    run(2, () => ({ slot: 1 }));
    run(60, () => ({ held: H.FIRE, act: A.FIRE }));
    run(2, () => ({ act: A.RELOAD }));
    run(90, () => ({}));
    run(2, () => ({ slot: 3 }));
    run(40, (i) => ({ held: H.FIRE, act: i === 0 ? A.FIRE : 0, pitch: -0.1 }));
    run(2, () => ({ slot: 0 }));
    run(120, () => ({ held: H.FIRE }));
    // Let the bots fight, then render some frames.
    run(1800, () => ({}));
    log.alive = m.aliveCount();
    log.events = m.tickCount;
    return log;
  });
  console.log('deep', result);
  await page.waitForTimeout(3000);
}
if (process.argv[3]) await page.screenshot({ path: process.argv[3] });
await browser.close();
if (errors.length) { console.error('console errors:\n' + errors.join('\n')); process.exit(1); }
if (state.tick < 30) { console.error('sim did not advance'); process.exit(1); }
console.log('smoke ok');
