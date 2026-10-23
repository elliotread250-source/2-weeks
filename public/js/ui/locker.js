// The locker: pick what your character wears and carries. Left column lists the
// slots, the centre shows a live 3D preview (drag to spin, wheel to zoom), the
// right side is a filterable grid of everything in the catalog. Items you do not
// own can be previewed but not equipped; the shop (Phase 6) is where they get bought.
import { BY_TYPE, TYPE_LABELS, item, PALETTE_COLOURS } from '/shared/cosmetics/catalog.js';
import { RARITY_NAMES } from '/shared/names.js';
import { store, equip, setStyle, setColour } from '../client/loadout.js';
import { getIcon } from '../render/icons3d.js';

const $ = (s) => document.querySelector(s);

const SLOTS = [
  { id: 'outfit', type: 'outfit', label: 'Outfit' },
  { id: 'backBling', type: 'backBling', label: 'Back Bling' },
  { id: 'pickaxe', type: 'pickaxe', label: 'Harvesting Tool' },
  { id: 'glider', type: 'glider', label: 'Glider' },
  { id: 'contrail', type: 'contrail', label: 'Contrail' },
  { id: 'wrap', type: 'wrap', label: 'Weapon Wrap' },
  ...Array.from({ length: 6 }, (_, i) => ({ id: `emote${i}`, type: 'emote', label: `Emote ${i + 1}` })),
  { id: 'banner', type: 'banner', label: 'Banner' },
  { id: 'loadingScreen', type: 'loadingScreen', label: 'Loading Screen' },
];

let stage = null;
let active = SLOTS[0];
const filter = { rarity: -1, owned: false, q: '' };
let hoverId = null;

function equippedId(slot) {
  const l = store.loadout;
  return slot.id.startsWith('emote') ? l.emotes[Number(slot.id.slice(5))] : l[slot.id];
}

function renderSlots() {
  $('#locker-slots').innerHTML = SLOTS.map((s) => {
    const it = equippedId(s) && item(equippedId(s));
    return `<button class="slot${s === active ? ' on' : ''}" data-slot="${s.id}"><small>${s.label}</small><span>${it ? it.name : 'Empty'}</span></button>`;
  }).join('');
}

function visibleItems() {
  const q = filter.q.toLowerCase();
  return BY_TYPE[active.type]
    .filter((it) => (filter.rarity < 0 || it.rarity === filter.rarity) && (!filter.owned || store.owned.has(it.id)) && (!q || it.name.toLowerCase().includes(q)))
    .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
}

function renderGrid() {
  const eq = equippedId(active);
  const none = active.type !== 'outfit' && active.type !== 'pickaxe' && active.type !== 'glider'
    ? `<button class="tile none${!eq ? ' eq' : ''}" data-id=""><b>None</b></button>` : '';
  const tiles = visibleItems().map((it) => {
    const owned = store.owned.has(it.id);
    return `<button class="tile r${it.rarity}${owned ? '' : ' locked'}${eq === it.id ? ' eq' : ''}" data-id="${it.id}" title="${it.name}">
      <img alt="" data-icon="${it.id}" /><b>${it.name}</b>${owned ? '' : `<i>${it.shop === false ? 'Challenge' : it.price}</i>`}</button>`;
  }).join('');
  const grid = $('#locker-grid');
  grid.innerHTML = none + tiles;
  grid.querySelectorAll('img[data-icon]').forEach(async (img) => {
    const url = await getIcon(img.dataset.icon);
    if (url && img.isConnected) img.src = url;
  });
}

function renderStyles() {
  const box = $('#locker-styles');
  const o = item(store.loadout.outfit);
  if (active.id !== 'outfit' || !o) { box.innerHTML = ''; return; }
  let html = '';
  if (o.styles.length) {
    html += `<div class="row"><small>Style</small><button class="chip${!store.loadout.outfitStyle ? ' on' : ''}" data-style="">Default</button>`;
    for (const s of o.styles) {
      const open = !s.unlock || store.owned.has(s.unlock) || store.owned.has(`style:${o.id}:${s.id}`);
      html += `<button class="chip${store.loadout.outfitStyle === s.id ? ' on' : ''}${open ? '' : ' locked'}" data-style="${s.id}" ${open ? '' : 'disabled'}>${s.name}${open ? '' : ' (locked)'}</button>`;
    }
    html += '</div>';
  }
  if (o.customisable) {
    const cur = store.loadout.colours[o.id] || {};
    for (const [which, label] of [['primary', 'Top'], ['secondary', 'Bottom'], ['accent', 'Accent']]) {
      html += `<div class="row"><small>${label}</small>${PALETTE_COLOURS.map((c) => `<button class="sw${cur[which] === c ? ' on' : ''}" data-which="${which}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>`;
    }
  }
  box.innerHTML = html;
}

function describe(it) {
  const info = $('#locker-info');
  if (!it) { info.innerHTML = ''; return; }
  const owned = store.owned.has(it.id);
  const status = owned ? 'Owned' : it.shop === false ? 'Unlocked by a challenge' : `${it.price} Coins (Item Shop)`;
  info.innerHTML = `<h4 class="r${it.rarity}">${it.name}</h4><small>${RARITY_NAMES[it.rarity]} ${TYPE_LABELS[it.type]}</small><p>${it.desc || ''}</p><p class="${owned ? 'ok' : 'lock'}">${status}</p>`;
}

function preview(id) {
  if (!stage) return;
  const it = id && item(id);
  const lo = structuredClone(store.loadout);
  if (it && active.type !== 'emote') {
    if (active.type === 'outfit') { lo.outfit = id; lo.outfitStyle = ''; }
    else lo[active.id] = id;
  }
  stage.setLoadout(lo);
  if (!it) return;
  if (it.type === 'emote') stage.playEmote(it.clip);
  else if (it.type === 'glider') stage.showGlider(id);
  else if (it.type === 'wrap') stage.setHeld('ar');
  else stage.idle();
}

function refresh() {
  renderSlots();
  renderGrid();
  renderStyles();
  describe(item(hoverId || equippedId(active)));
  preview(hoverId || (active.type === 'outfit' ? null : equippedId(active)));
}

export async function openLocker() {
  $('#locker').classList.remove('hidden');
  if (!stage) {
    const { CharacterStage } = await import('../render/stage.js');
    stage = new CharacterStage($('#locker-canvas'));
  }
  refresh();
}

function closeLocker() {
  $('#locker').classList.add('hidden');
  if (stage) { stage.dispose(); stage = null; }
}

export function initLocker() {
  $('#locker-btn').addEventListener('click', openLocker);
  $('#locker-close').addEventListener('click', closeLocker);
  $('#locker-slots').addEventListener('click', (e) => {
    const b = e.target.closest('[data-slot]');
    if (!b) return;
    active = SLOTS.find((s) => s.id === b.dataset.slot);
    hoverId = null;
    refresh();
  });
  $('#locker-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.tile');
    if (!b) return;
    const id = b.dataset.id;
    if (id && !store.owned.has(id)) { describe(item(id)); return; }
    equip(active.id, id || null);
  });
  $('#locker-grid').addEventListener('mouseover', (e) => {
    const b = e.target.closest('.tile');
    const id = b && b.dataset.id;
    if (id !== hoverId && id) { hoverId = id; describe(item(id)); preview(id); }
  });
  $('#locker-grid').addEventListener('mouseleave', () => { hoverId = null; refresh(); });
  $('#locker-styles').addEventListener('click', (e) => {
    const s = e.target.closest('[data-style]');
    if (s && !s.disabled) setStyle(s.dataset.style);
    const c = e.target.closest('[data-c]');
    if (c) setColour(c.dataset.which, c.dataset.c);
  });
  $('#locker-search').addEventListener('input', (e) => { filter.q = e.target.value; renderGrid(); });
  $('#locker-rarity').addEventListener('change', (e) => { filter.rarity = Number(e.target.value); renderGrid(); });
  $('#locker-owned').addEventListener('change', (e) => { filter.owned = e.target.checked; renderGrid(); });
  store.listeners.push(() => { if (!$('#locker').classList.contains('hidden')) { hoverId = null; refresh(); } });
}
