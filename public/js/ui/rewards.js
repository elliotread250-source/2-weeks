// What the end-of-match card says about coins. Signed-in players see the real
// payout from the server; guests see what they would have earned and a prompt.
import { GAME } from '/shared/names.js';

const LABELS = { eliminations: 'Eliminations', assists: 'Assists', placement: 'Placement', survival: 'Survival' };

export function renderRewards(el, reward, { guest = false, estimate = null } = {}) {
  const r = reward || estimate;
  if (!r) { el.innerHTML = ''; return; }
  const rows = Object.entries(r.parts || {}).filter(([, v]) => v > 0)
    .map(([k, v]) => `<div><span>${LABELS[k] || k}</span><b>+${v}</b></div>`).join('');
  const extra = (r.challenges || []).map((c) => `<div class="chal"><span>Challenge: ${c.text}</span><b>+${c.coins}</b></div>`).join('');
  const total = (r.coins || r.total || 0) + (r.bonus || 0);
  let foot = '';
  if (guest) foot = `<p class="hint">Make an account to keep these ${GAME.currency}.</p>`;
  else if (r.capped) foot = '<p class="hint">Daily offline cap reached. Online matches have no cap.</p>';
  else if (r.balance != null) foot = `<p class="hint">Balance: ${r.balance} ${GAME.currency}</p>`;
  el.innerHTML = `<div class="rw-box"><h4>${total} ${GAME.currency}${guest ? ' (not saved)' : ''}</h4>${rows}${extra}${foot}</div>`;
}
