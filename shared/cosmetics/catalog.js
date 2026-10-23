// The cosmetic catalog: every item a player can own, equip, preview or buy.
// Pure data plus lookups, shared by the client (locker, shop, rendering) and the
// server (ownership checks, shop rotation, challenge rewards).
import { EMOTE_NAMES, RARITY_NAMES } from '../names.js';
import { buildOutfitDefs, PALETTE } from './outfitdefs.js';
import {
  BACK_BLINGS, PICKAXES, GLIDERS, CONTRAILS, WRAPS, BANNERS, LOADING_SCREENS, EMOTE_RARITY, EMOTE_IDS,
} from './itemdefs.js';

export const TYPES = ['outfit', 'backBling', 'pickaxe', 'glider', 'contrail', 'wrap', 'emote', 'banner', 'loadingScreen'];
export const TYPE_LABELS = {
  outfit: 'Outfit', backBling: 'Back Bling', pickaxe: 'Harvesting Tool', glider: 'Glider', contrail: 'Contrail',
  wrap: 'Weapon Wrap', emote: 'Emote', banner: 'Banner', loadingScreen: 'Loading Screen',
};

// Coins by rarity (outfits). Other types are priced as in the master plan.
const OUTFIT_PRICE = [200, 400, 800, 1200, 1800];
const FACTOR = { backBling: 0.6, pickaxe: 0.6, glider: 0.6, contrail: 0.6 };
const FLAT = {
  emote: [200, 300, 400, 450, 500],
  wrap: [300, 350, 450, 550, 600],
  banner: [100, 150, 200, 250, 300],
  loadingScreen: [150, 200, 250, 300, 400],
};

export function priceFor(type, rarity) {
  if (type === 'outfit') return OUTFIT_PRICE[rarity];
  if (FACTOR[type]) return Math.round((OUTFIT_PRICE[rarity] * FACTOR[type]) / 10) * 10;
  return FLAT[type][rarity];
}

// Items that never appear in the shop: they unlock from challenges/milestones.
const UNLOCKS = ['milestone_wins_1', 'milestone_wins_5', 'milestone_wins_10', 'milestone_kills_50', 'milestone_kills_200', 'milestone_matches_25', 'milestone_matches_100', 'milestone_chests_100', 'milestone_harvest_5000', 'milestone_build_2000'];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const items = new Map();
const byType = Object.fromEntries(TYPES.map((t) => [t, []]));
let unlockCursor = 0;

function put(item) {
  const full = {
    free: false, shop: true, styles: [], series: '', ...item,
    rarityName: RARITY_NAMES[item.rarity],
  };
  full.price = full.free ? 0 : priceFor(full.type, full.rarity);
  // Roughly one in eight Rare-and-up items is challenge-only.
  if (!full.free && full.rarity >= 2 && full.type !== 'outfit' && items.size % 8 === 0) {
    full.shop = false;
    full.unlock = UNLOCKS[unlockCursor++ % UNLOCKS.length];
  }
  if (items.has(full.id)) throw new Error(`duplicate cosmetic id ${full.id}`);
  items.set(full.id, full);
  byType[full.type].push(full);
}

for (const o of buildOutfitDefs()) {
  put({ ...o, type: 'outfit' });
}

const addRows = (type, rows, make) => rows.forEach((row, i) => {
  const [name, rarity] = row;
  const base = type === 'pickaxe' && i === 0 ? 'pickaxe_default' : type === 'glider' && i === 0 ? 'glider_default' : `${type.toLowerCase()}_${slug(name)}`;
  put({ type, id: base, name, rarity, free: base.endsWith('_default'), ...make(row) });
});

addRows('backBling', BACK_BLINGS, ([name, , kind, a, b]) => ({ spec: { kind, a, b }, desc: `${name}: a ${kind} for your back.` }));
addRows('pickaxe', PICKAXES, ([name, , head, handle, color, trim]) => ({ spec: { head, handle, color, trim }, desc: `${name}. Swings like it means it.` }));
addRows('glider', GLIDERS, ([name, , shape, a, b]) => ({ spec: { shape, a, b }, desc: `${name}. Catches the air in style.` }));
addRows('contrail', CONTRAILS, ([name, , pattern, a, b]) => ({ spec: { pattern, a, b }, desc: `${name}. Leaves a mark in the sky.` }));
addRows('wrap', WRAPS, ([name, , kind, a, b]) => ({ spec: { kind, a, b }, desc: `${name}. Applies to every weapon you carry.` }));
addRows('banner', BANNERS, ([name, , shape, a, b, icon]) => ({ spec: { shape, a, b, icon }, desc: `${name}. Show it off at the end of a match.` }));
addRows('loadingScreen', LOADING_SCREENS, ([name, , a, b, tip]) => ({ spec: { a, b, tip }, desc: `${name}. ${tip}` }));

EMOTE_NAMES.forEach((name, i) => {
  put({
    type: 'emote', id: EMOTE_IDS[i], name, rarity: EMOTE_RARITY[i], clip: i + 1, free: i < 2,
    desc: `${name}. Press and hold to play.`,
  });
});

export const CATALOG = items;
export const BY_TYPE = byType;
export const PALETTE_COLOURS = PALETTE;

export const item = (id) => items.get(id) || null;
export const all = () => [...items.values()];

// Everything every account owns from the start.
export const FREE_ITEMS = all().filter((i) => i.free).map((i) => i.id);

export const DEFAULT_LOADOUT = {
  outfit: 'outfit_0', outfitStyle: '', backBling: null, pickaxe: 'pickaxe_default', glider: 'glider_default',
  contrail: null, wrap: null, emotes: ['emote_wave', 'emote_dance_basic', null, null, null, null], banner: null, loadingScreen: null, colours: {},
};

// Validate a loadout against what the player owns. Anything not owned (or not a
// real item of that slot) falls back to the default. Returns a clean copy.
export function sanitizeLoadout(raw, owned) {
  const own = owned instanceof Set ? owned : new Set(owned);
  const l = { ...DEFAULT_LOADOUT, emotes: [...DEFAULT_LOADOUT.emotes], colours: {} };
  const pick = (slot, type) => {
    const id = raw && raw[slot];
    const it = id ? items.get(id) : null;
    return it && it.type === type && (own.has(id) || it.free) ? id : DEFAULT_LOADOUT[slot];
  };
  l.outfit = pick('outfit', 'outfit');
  l.backBling = pick('backBling', 'backBling');
  l.pickaxe = pick('pickaxe', 'pickaxe');
  l.glider = pick('glider', 'glider');
  l.contrail = pick('contrail', 'contrail');
  l.wrap = pick('wrap', 'wrap');
  l.banner = pick('banner', 'banner');
  l.loadingScreen = pick('loadingScreen', 'loadingScreen');
  const outfit = items.get(l.outfit);
  const style = raw && outfit && outfit.styles.find((s) => s.id === raw.outfitStyle);
  l.outfitStyle = style && (!style.unlock || own.has(`style:${l.outfit}:${style.id}`) || own.has(style.unlock)) ? style.id : '';
  const emotes = raw && Array.isArray(raw.emotes) ? raw.emotes.map((e) => e || null) : [];
  for (let i = 0; i < 6; i++) {
    const id = emotes[i];
    const it = id ? items.get(id) : null;
    l.emotes[i] = it && it.type === 'emote' && (own.has(id) || it.free) ? id : (i < 2 ? DEFAULT_LOADOUT.emotes[i] : null);
  }
  const col = raw && raw.colours && raw.colours[l.outfit];
  if (col && outfit && outfit.customisable) {
    const ok = (c) => typeof c === 'string' && PALETTE.includes(c);
    l.colours[l.outfit] = { primary: ok(col.primary) ? col.primary : null, secondary: ok(col.secondary) ? col.secondary : null, accent: ok(col.accent) ? col.accent : null };
  }
  return l;
}

// The recipe the renderer builds: outfit + style + custom colours + back bling.
export function resolveOutfit(loadout) {
  const l = loadout || DEFAULT_LOADOUT;
  const outfit = items.get(l.outfit) || items.get('outfit_0');
  const r = { ...outfit.recipe };
  const style = outfit.styles.find((s) => s.id === l.outfitStyle);
  if (style) Object.assign(r, style.set);
  const c = l.colours && l.colours[outfit.id];
  if (c && outfit.customisable) {
    if (c.primary) r.shirt = c.primary;
    if (c.secondary) r.pants = c.secondary;
    if (c.accent) r.accent = c.accent;
  }
  const bb = l.backBling && items.get(l.backBling);
  if (bb) { r.bling = bb.spec.kind; r.blingA = bb.spec.a; r.blingB = bb.spec.b; }
  return r;
}

export function randomLoadout(rng) {
  const outfits = byType.outfit;
  const o = outfits[Math.floor(rng.random() * outfits.length)];
  const l = { ...DEFAULT_LOADOUT, emotes: [...DEFAULT_LOADOUT.emotes], colours: {}, outfit: o.id };
  if (o.styles.length && rng.random() < 0.5) {
    const s = o.styles.filter((x) => !x.unlock);
    if (s.length) l.outfitStyle = s[Math.floor(rng.random() * s.length)].id;
  }
  const pick = (t, p) => { if (rng.random() < p) l[t === 'backBling' ? 'backBling' : t] = byType[t][Math.floor(rng.random() * byType[t].length)].id; };
  pick('backBling', 0.5); pick('pickaxe', 0.7); pick('glider', 0.7); pick('contrail', 0.35); pick('wrap', 0.35);
  return l;
}
