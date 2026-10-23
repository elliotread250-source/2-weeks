// The item shop: today's featured and daily shelves, bought with Coins. The
// server decides what is on sale and charges once per item, whatever the client does.
import { GAME, RARITY_NAMES } from '/shared/names.js';
import { item } from '/shared/cosmetics/catalog.js';
import { account, refreshAccount } from './account.js';
import { refreshLoadout } from '../client/loadout.js';
import { getIcon } from '../render/icons3d.js';
import { toast } from './toast.js';

const $ = (s) => document.querySelector(s);
let data = null;
let confirming = null;
let timer = null;

const fmtLeft = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`; };

function tile(it) {
  const full = item(it.id);
  const cls = `tile r${it.rarity}${it.owned ? ' eq' : ''}${confirming === it.id ? ' confirm' : ''}`;
  const label = it.owned ? 'Owned' : confirming === it.id ? 'Tap to confirm' : `${it.price}`;
  return `<button class="${cls}" data-id="${it.id}" title="${full.desc || full.name}"><img alt="" data-icon="${it.id}" /><b>${it.name}</b><i>${label}</i></button>`;
}

function render() {
  const body = $('#shop-body');
  if (!account.profile) { body.innerHTML = `<p class="shop-msg">Sign in to buy items. You can still browse the locker as a guest.</p>`; return; }
  $('#shop-coins').textContent = `${account.profile.wallet.coins} ${GAME.currency}`;
  if (!data) { body.innerHTML = '<p class="shop-msg">Loading...</p>'; return; }
  body.innerHTML = `<h3>Featured</h3><div class="shop-row big">${data.featured.map(tile).join('')}</div>
    <h3>Daily</h3><div class="shop-row">${data.daily.map(tile).join('')}</div>
    <p class="hint" id="shop-reset"></p>`;
  body.querySelectorAll('img[data-icon]').forEach(async (img) => { const u = await getIcon(img.dataset.icon); if (u && img.isConnected) img.src = u; });
  tick();
}

function tick() {
  const el = $('#shop-reset');
  if (el && data) el.textContent = `Shelves change in ${fmtLeft(data.resetsAt - Date.now())} (00:00 UTC). ${RARITY_NAMES[4]} items are rare.`;
}

async function load() {
  data = null;
  render();
  if (!account.profile) return;
  try {
    const r = await fetch('/api/shop');
    data = r.ok ? await r.json() : null;
  } catch { data = null; }
  if (!data) $('#shop-body').innerHTML = '<p class="shop-msg">Can\'t reach the shop right now.</p>';
  else render();
}

async function buy(id) {
  try {
    const r = await fetch('/api/shop/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    const j = await r.json();
    if (!r.ok) { toast(j.error || 'Could not buy that', 'bad'); return; }
    toast(`Bought ${item(id).name}`, 'good');
    await refreshAccount();
    refreshLoadout();
    await load();
  } catch { toast('Could not reach the server', 'bad'); }
}

export function initShop() {
  $('#shop-btn').addEventListener('click', () => {
    $('#shop').classList.remove('hidden');
    confirming = null;
    load();
    timer = setInterval(tick, 30000);
  });
  $('#shop-close').addEventListener('click', () => { $('#shop').classList.add('hidden'); clearInterval(timer); });
  $('#shop-body').addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (!t || t.classList.contains('eq')) return;
    const id = t.dataset.id;
    if (confirming === id) { confirming = null; buy(id); return; }
    confirming = id;
    render();
  });
}
