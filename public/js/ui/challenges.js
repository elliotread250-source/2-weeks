// Challenges screen: three dailies (one reroll a day), seven weeklies, lifetime
// milestones. Progress is tracked by the server from finished online matches.
import { GAME } from '/shared/names.js';
import { account } from './account.js';
import { toast } from './toast.js';

const $ = (s) => document.querySelector(s);
let data = null;

const row = (c, slot = -1, canReroll = false) => `<div class="chal-row${c.done ? ' done' : ''}">
  <div class="chal-text"><b>${c.text}</b><div class="bar"><i style="width:${Math.round((c.progress / c.target) * 100)}%"></i></div><small>${c.progress} / ${c.target}</small></div>
  <div class="chal-reward">+${c.coins}<small>${GAME.currency}</small></div>
  ${slot >= 0 && !c.done && canReroll ? `<button class="chip" data-reroll="${slot}">Reroll</button>` : ''}</div>`;

const left = (ms) => { const s = Math.max(0, Math.floor((ms - Date.now()) / 1000)); const d = Math.floor(s / 86400); return d ? `${d}d ${Math.floor(s / 3600) % 24}h` : `${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}m`; };

function render() {
  const body = $('#chal-body');
  if (!account.profile) { body.innerHTML = '<p class="shop-msg">Sign in to track challenges. Progress counts from online matches.</p>'; return; }
  if (!data) { body.innerHTML = '<p class="shop-msg">Loading...</p>'; return; }
  const can = data.rerollsLeft > 0;
  body.innerHTML = `<h3>Daily <small>resets in ${left(data.dailyResetsAt)}${can ? ' · 1 reroll left' : ''}</small></h3>${data.daily.map((c, i) => row(c, i, can)).join('')}
    <h3>Weekly <small>resets in ${left(data.weeklyResetsAt)}</small></h3>${data.weekly.map((c) => row(c)).join('')}
    <h3>Milestones <small>unlock items</small></h3>${data.milestones.map((c) => row(c)).join('')}`;
}

async function load() {
  data = null;
  render();
  if (!account.profile) return;
  try { const r = await fetch('/api/challenges'); data = r.ok ? await r.json() : null; } catch { data = null; }
  render();
}

export function initChallenges() {
  $('#chal-btn').addEventListener('click', () => { $('#challenges').classList.remove('hidden'); load(); });
  $('#chal-close').addEventListener('click', () => $('#challenges').classList.add('hidden'));
  $('#chal-body').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-reroll]');
    if (!b) return;
    try {
      const r = await fetch('/api/challenges/reroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot: Number(b.dataset.reroll) }) });
      const j = await r.json();
      if (!r.ok) toast(j.error || 'Could not reroll', 'bad');
    } catch { toast('Could not reach the server', 'bad'); }
    load();
  });
}
