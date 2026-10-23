// The player's current loadout and what they own. Signed-in players keep it on
// the server; guests keep it in this browser and can only equip free items.
import { DEFAULT_LOADOUT, FREE_ITEMS, sanitizeLoadout } from '/shared/cosmetics/catalog.js';
import { account } from '../ui/account.js';

const KEY = 'twoweeks.loadout.v1';

export const store = {
  loadout: structuredClone(DEFAULT_LOADOUT),
  owned: new Set(FREE_ITEMS),
  listeners: [],
};

function emit() { for (const fn of store.listeners) fn(store); }

export function refreshLoadout() {
  const p = account.profile;
  if (p) {
    store.owned = new Set([...FREE_ITEMS, ...p.owned]);
    store.loadout = sanitizeLoadout(p.loadout, store.owned);
  } else {
    store.owned = new Set(FREE_ITEMS);
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY)); } catch { /* none saved */ }
    store.loadout = sanitizeLoadout(raw, store.owned);
  }
  emit();
}

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (account.profile) {
      try {
        await fetch('/api/loadout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loadout: store.loadout }) });
      } catch { /* offline: the next save will retry */ }
    } else {
      try { localStorage.setItem(KEY, JSON.stringify(store.loadout)); } catch { /* private mode */ }
    }
  }, 250);
}

// slot: outfit, backBling, pickaxe, glider, contrail, wrap, banner, loadingScreen, or emote0..emote5
export function equip(slot, id) {
  const l = structuredClone(store.loadout);
  if (slot.startsWith('emote')) l.emotes[Number(slot.slice(5))] = id;
  else {
    l[slot] = id;
    if (slot === 'outfit') l.outfitStyle = '';
  }
  store.loadout = sanitizeLoadout(l, store.owned);
  emit();
  persist();
}

export function setStyle(styleId) {
  store.loadout = sanitizeLoadout({ ...store.loadout, outfitStyle: styleId }, store.owned);
  emit();
  persist();
}

export function setColour(which, hex) {
  const l = structuredClone(store.loadout);
  const cur = l.colours[l.outfit] || {};
  l.colours[l.outfit] = { ...cur, [which]: hex };
  store.loadout = sanitizeLoadout(l, store.owned);
  emit();
  persist();
}

export const currentLoadout = () => store.loadout;
