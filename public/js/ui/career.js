// Career screen: lifetime numbers and the last dozen online matches.
import { account } from './account.js';

const $ = (s) => document.querySelector(s);

const fmtTime = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}m` : `${Math.floor(s / 60)}m`);
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '0%');

function render(data) {
  const body = $('#career-body');
  if (!account.profile) { body.innerHTML = '<p class="shop-msg">Sign in to keep a career. Online matches are recorded for signed-in players.</p>'; return; }
  if (!data) { body.innerHTML = '<p class="shop-msg">Loading...</p>'; return; }
  const s = data.stats;
  const deaths = Math.max(0, s.matches - s.wins);
  const card = (v, label) => `<div class="career-card"><b>${v}</b><span>${label}</span></div>`;
  const rows = data.recent.map((r) => `<tr><td class="${r.placement === 1 ? 'win' : ''}">#${r.placement}</td><td>${r.kills}</td><td>${r.damage}</td><td>${fmtTime(r.survivalS)}</td><td>+${r.coins}</td><td>${r.players}</td></tr>`).join('');
  body.innerHTML = `<div class="career-grid">
    ${card(s.matches, 'Matches')}${card(s.wins, 'Wins')}${card(pct(s.wins, s.matches), 'Win rate')}${card(s.top10, 'Top 10 finishes')}
    ${card(s.kills, 'Eliminations')}${card((s.kills / Math.max(1, deaths)).toFixed(2), 'K/D')}${card(s.damage.toLocaleString(), 'Damage dealt')}${card(fmtTime(s.timeAliveS), 'Time alive')}
    ${card(account.profile.wallet.lifetime.toLocaleString(), 'Coins earned')}</div>
    <h3>Recent matches</h3>
    ${rows ? `<table class="career-table"><tr><th>Place</th><th>Elims</th><th>Damage</th><th>Survived</th><th>Coins</th><th>Players</th></tr>${rows}</table>` : '<p class="shop-msg">No online matches yet.</p>'}`;
}

export function initCareer() {
  $('#career-btn').addEventListener('click', async () => {
    $('#career').classList.remove('hidden');
    render(null);
    if (!account.profile) return;
    try { const r = await fetch('/api/career'); render(r.ok ? await r.json() : null); } catch { render(null); }
  });
  $('#career-close').addEventListener('click', () => $('#career').classList.add('hidden'));
}
