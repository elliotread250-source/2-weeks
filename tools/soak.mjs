// Headless soak: a full match of bots on the server's Match class with no
// clients, reporting tick cost. Usage: node tools/soak.mjs [bots=32] [minutes=10]
import { performance } from 'node:perf_hooks';
import { Match } from '../shared/sim/match.js';

const bots = Number(process.argv[2] || 32);
const minutes = Number(process.argv[3] || 10);
const m = new Match({ seed: 7, botCount: bots, keepHistory: true });
m.addBots(bots);
m.start();
const times = [];
const t0 = performance.now();
for (let i = 0; i < 30 * 60 * minutes && m.phase !== 'over'; i++) {
  const a = performance.now();
  m.tick();
  m.takeEvents();
  times.push(performance.now() - a);
}
times.sort((x, y) => x - y);
const avg = times.reduce((x, y) => x + y, 0) / times.length;
const p99 = times[Math.floor(times.length * 0.99)];
const budget = 1000 / 30;
console.log(JSON.stringify({
  bots, simulatedSeconds: Math.round(m.time), ticks: times.length, wallSeconds: +((performance.now() - t0) / 1000).toFixed(1),
  avgTickMs: +avg.toFixed(3), p99TickMs: +p99.toFixed(3), maxTickMs: +times[times.length - 1].toFixed(3),
  budgetMs: +budget.toFixed(2), avgBudgetPercent: +((avg / budget) * 100).toFixed(1),
  alive: m.aliveCount(), phase: m.phase, rssMB: Math.round(process.memoryUsage().rss / 1e6),
}));
