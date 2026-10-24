// Hold Tab to see everything you carry in one place. Read-only; dropping an
// item is a keybind (H), which sends a normal command to the sim.
import { WEAPONS, CONSUMABLES, AMMO, RARITIES } from '/shared/config.js';
import { MATERIAL_NAMES } from '/shared/names.js';
import { itemName } from '/shared/sim/loot.js';
import { iconSVG, iconKey } from './icons.js';
import { label } from '../client/binds.js';

let el = null, last = '';

export function renderInventory(p, open) {
  if (!el) el = document.getElementById('inventory');
  if (!el) return;
  el.classList.toggle('hidden', !open);
  if (!open) { last = ''; return; }
  const slots = p.slots.map((it, i) => {
    if (!it) return `<div class="inv-slot empty"><b>${i + 2 > 6 ? '' : label(`slot${i + 1}`)}</b><span>Empty</span></div>`;
    const col = it.kind === 'weapon' ? RARITIES[it.rarity].color : '#fff';
    const extra = it.kind === 'weapon' ? `${it.mag}/${WEAPONS[it.type].mag}` : `x${it.count}`;
    return `<div class="inv-slot${p.selected === i + 1 ? ' sel' : ''}" style="border-color:${col}">${iconSVG(iconKey(it))}<span>${itemName(it)}</span><small>${extra}</small></div>`;
  }).join('');
  const ammo = Object.entries(AMMO).map(([k, a]) => `<div><i style="background:${a.color}"></i>${a.name}<b>${p.ammo[k]}</b></div>`).join('');
  const mats = Object.keys(MATERIAL_NAMES).map((k) => `<div>${MATERIAL_NAMES[k]}<b>${p.mats[k]}</b></div>`).join('');
  const html = `<h3>Inventory</h3><div class="inv-slots">${slots}</div><div class="inv-cols"><div><h4>Ammo</h4>${ammo}</div><div><h4>Materials</h4>${mats}</div></div><p class="hint">${label('drop')} drops the selected item</p>`;
  if (html !== last) { el.innerHTML = html; last = html; }
  void CONSUMABLES;
}
