import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG, BY_TYPE, TYPES, FREE_ITEMS, DEFAULT_LOADOUT, sanitizeLoadout, resolveOutfit, item, priceFor, all,
} from '../shared/cosmetics/catalog.js';
import { buildRig } from '../public/js/render/rig.js';
import { pickaxeMesh, gliderMesh } from '../public/js/render/cosmetics.js';

test('the catalog meets the launch targets', () => {
  const min = { outfit: 60, backBling: 30, pickaxe: 25, glider: 20, contrail: 12, wrap: 20, emote: 25, banner: 30 };
  for (const [t, n] of Object.entries(min)) assert.ok(BY_TYPE[t].length >= n, `${t}: ${BY_TYPE[t].length} < ${n}`);
  assert.ok(all().length >= 220);
});

test('every item has a unique id and a name and description', () => {
  const names = new Set();
  for (const i of CATALOG.values()) {
    assert.ok(i.name && i.desc, i.id);
    assert.ok(TYPES.includes(i.type));
    assert.ok(i.rarity >= 0 && i.rarity <= 4);
    const key = `${i.type}:${i.name}`;
    assert.ok(!names.has(key), `duplicate name ${key}`);
    names.add(key);
  }
});

test('all five rarities are represented in every big category', () => {
  for (const t of ['outfit', 'backBling', 'pickaxe', 'glider', 'wrap', 'banner']) {
    assert.equal(new Set(BY_TYPE[t].map((i) => i.rarity)).size, 5, t);
  }
});

test('there are Neon and Shadow series outfits', () => {
  assert.ok(BY_TYPE.outfit.some((o) => o.series === 'Neon' && o.recipe.fx === 'neon'));
  assert.ok(BY_TYPE.outfit.some((o) => o.series === 'Shadow' && o.recipe.fx === 'shadow'));
});

test('prices follow the plan', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((r) => priceFor('outfit', r)), [200, 400, 800, 1200, 1800]);
  for (const i of CATALOG.values()) {
    if (i.free) { assert.equal(i.price, 0); continue; }
    if (i.type === 'backBling' || i.type === 'pickaxe' || i.type === 'glider') {
      assert.ok(Math.abs(i.price / priceFor('outfit', i.rarity) - 0.6) < 0.05, `${i.id} ${i.price}`);
    }
    if (i.type === 'emote' && !i.free) assert.ok(i.price >= 200 && i.price <= 500);
    if (i.type === 'wrap') assert.ok(i.price >= 300 && i.price <= 600);
  }
});

test('some items are challenge-only and never in the shop', () => {
  const only = all().filter((i) => !i.shop);
  assert.ok(only.length >= 5);
  for (const i of only) assert.ok(i.unlock && i.unlock.startsWith('milestone_'), i.id);
});

test('everyone starts with eight outfits, a pickaxe, a glider and two emotes', () => {
  assert.equal(FREE_ITEMS.length, 12);
  assert.equal(FREE_ITEMS.filter((i) => i.startsWith('outfit_')).length, 8);
  assert.ok(FREE_ITEMS.includes('pickaxe_default') && FREE_ITEMS.includes('glider_default'));
  assert.deepEqual(DEFAULT_LOADOUT.emotes.slice(0, 2), ['emote_wave', 'emote_dance_basic']);
});

test('Rare and above outfits have styles; some unlock from challenges', () => {
  const rare = BY_TYPE.outfit.filter((o) => o.rarity >= 2);
  assert.ok(rare.every((o) => o.styles.length >= 2));
  assert.ok(BY_TYPE.outfit.some((o) => o.styles.some((s) => s.unlock)));
});

test('a loadout cannot equip what the player does not own', () => {
  const pick = BY_TYPE.pickaxe[5].id;
  const l = sanitizeLoadout({ pickaxe: pick, outfit: BY_TYPE.outfit[20].id, emotes: ['emote_flex'] }, new Set(FREE_ITEMS));
  assert.equal(l.pickaxe, 'pickaxe_default');
  assert.equal(l.outfit, 'outfit_0');
  assert.equal(l.emotes[0], 'emote_wave', 'unowned emote replaced by the default in slot 0');
  const owned = new Set([...FREE_ITEMS, pick, BY_TYPE.outfit[20].id]);
  const l2 = sanitizeLoadout({ pickaxe: pick, outfit: BY_TYPE.outfit[20].id }, owned);
  assert.equal(l2.pickaxe, pick);
  assert.equal(l2.outfit, BY_TYPE.outfit[20].id);
  // Wrong slot type is refused too.
  assert.equal(sanitizeLoadout({ pickaxe: BY_TYPE.glider[3].id }, new Set([...FREE_ITEMS, BY_TYPE.glider[3].id])).pickaxe, 'pickaxe_default');
});

test('styles and custom colours resolve into the recipe', () => {
  const o = BY_TYPE.outfit.find((x) => x.rarity >= 2 && x.customisable);
  const owned = new Set([...FREE_ITEMS, o.id]);
  const l = sanitizeLoadout({ outfit: o.id, outfitStyle: 'bare', colours: { [o.id]: { primary: '#e74c3c', secondary: '#notacolour', accent: '#ecf0f1' } } }, owned);
  assert.equal(l.outfitStyle, 'bare');
  assert.equal(l.colours[o.id].secondary, null, 'colours outside the palette are refused');
  const r = resolveOutfit(l);
  assert.equal(r.hairStyle, 'short');
  assert.equal(r.shirt, '#e74c3c');
  assert.equal(r.accent, '#ecf0f1');
  const gold = o.styles.find((s) => s.unlock);
  if (gold) assert.equal(sanitizeLoadout({ outfit: o.id, outfitStyle: gold.id }, owned).outfitStyle, '', 'locked styles need their unlock');
});

test('equipping a back bling changes the recipe', () => {
  const bb = BY_TYPE.backBling[8];
  const r = resolveOutfit(sanitizeLoadout({ backBling: bb.id }, new Set([...FREE_ITEMS, bb.id])));
  assert.equal(r.bling, bb.spec.kind);
  assert.equal(r.blingA, bb.spec.a);
});

test('every outfit, pickaxe and glider can be built', () => {
  for (const o of BY_TYPE.outfit) assert.ok(buildRig(resolveOutfit({ ...DEFAULT_LOADOUT, outfit: o.id })).mesh.isSkinnedMesh);
  for (const p of BY_TYPE.pickaxe) assert.ok(pickaxeMesh(p.id).children.length >= 3);
  for (const g of BY_TYPE.glider) assert.ok(gliderMesh(g.id).children.length >= 1);
  assert.ok(item('emote_flex').clip === 4);
});

test('neon outfits get a separate glowing mesh sharing the skeleton', () => {
  const neon = BY_TYPE.outfit.find((o) => o.series === 'Neon');
  const rig = buildRig(resolveOutfit({ ...DEFAULT_LOADOUT, outfit: neon.id }));
  assert.ok(rig.glowMesh);
  assert.equal(rig.glowMesh.skeleton, rig.skeleton);
  const plain = buildRig(resolveOutfit(DEFAULT_LOADOUT));
  assert.equal(plain.glowMesh, null);
});
