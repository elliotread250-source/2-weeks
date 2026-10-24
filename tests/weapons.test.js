import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, spawn, Vec3 } from './helpers.js';
import { Match } from '../shared/sim/match.js';
import { WEAPONS, CONSUMABLES, GRENADE, SUPPLY } from '../shared/config.js';
import { rollWeapon } from '../shared/sim/loot.js';
import { Rng } from '../shared/math/util.js';
import { classOfWeapon } from '../public/js/render/anims/weapons.js';
import { ICONS } from '../public/js/ui/icons.js';

function armed(m, type, rarity = 3) {
  const s = spawn(m, -60, 60, { name: 'shooter' });
  s.slots[0] = { kind: 'weapon', type, rarity, mag: WEAPONS[type].mag };
  s.selected = 1;
  s.ammo[WEAPONS[type].ammo] = 200;
  return s;
}

test('every weapon has complete data, an animation class and an icon', () => {
  for (const [id, w] of Object.entries(WEAPONS)) {
    assert.equal(w.damage.length, 5, id);
    assert.equal(w.reload.length, 5, id);
    assert.ok(w.mag > 0 && w.fireRate > 0 && w.range > 0, id);
    assert.ok(classOfWeapon[id], `${id} needs an animation class`);
    assert.ok(ICONS[id], `${id} needs an icon`);
    // A weapon only rolls at rarities where it has damage.
    const r = rollWeapon(new Rng(5), 'chest');
    assert.ok(WEAPONS[r.type].damage[r.rarity] != null);
  }
  assert.ok(ICONS.grenade && CONSUMABLES.grenade.throw);
});

test('every new weapon can roll from loot', () => {
  const rng = new Rng(3);
  const seen = new Set();
  for (let i = 0; i < 4000; i++) seen.add(rollWeapon(rng, 'floor').type);
  for (const t of Object.keys(WEAPONS)) assert.ok(seen.has(t), `${t} never rolls`);
});

test('burst rifle fires three rounds per pull, spaced by the burst gap', () => {
  const m = harness();
  const s = armed(m, 'burst');
  const eye = new Vec3(s.pos.x, s.pos.y + 1.7, s.pos.z);
  s.yaw = 0; s.pitch = 0;
  assert.equal(m.combat.fire(s, eye, new Vec3(0, 0, -1), { ads: true }), true);
  assert.equal(s.slots[0].mag, WEAPONS.burst.mag - 1);
  for (let i = 0; i < 12; i++) m.combat.update(1 / 30);
  assert.equal(s.slots[0].mag, WEAPONS.burst.mag - 3);
  for (let i = 0; i < 12; i++) m.combat.update(1 / 30);
  assert.equal(s.slots[0].mag, WEAPONS.burst.mag - 3, 'no fourth round');
  assert.equal(s.burst, null);
});

test('switching weapon cancels a burst in progress', () => {
  const m = harness();
  const s = armed(m, 'burst');
  const eye = new Vec3(s.pos.x, s.pos.y + 1.7, s.pos.z);
  m.combat.fire(s, eye, new Vec3(0, 0, -1), { ads: true });
  s.select(0);
  for (let i = 0; i < 12; i++) m.combat.update(1 / 30);
  assert.equal(s.slots[0].mag, WEAPONS.burst.mag - 1);
});

test('tactical shotgun hits harder up close than far, revolver headshot beats body', () => {
  const m = harness();
  const s = armed(m, 'tac');
  const t = spawn(m, -60, 56, { name: 'near' });
  t.shield = 0;
  const eye = new Vec3(s.pos.x, s.pos.y + 1.7, s.pos.z);
  m.combat.fire(s, eye, new Vec3(0, t.pos.y + 1 - eye.y, -4).normalize(), { ads: true });
  assert.ok(100 - t.hp > 40, `close tac shot did ${100 - t.hp}`);
  assert.ok(WEAPONS.revolver.headMult > 2);
});

test('a thrown grenade arcs, bounces, explodes after the fuse and uses one up', () => {
  const m = harness();
  const s = spawn(m, -60, 60, { name: 'thrower' });
  s.slots[0] = { kind: 'consumable', type: 'grenade', count: 2 };
  s.selected = 1;
  const victim = spawn(m, -60, 52, { name: 'victim' });
  victim.shield = 0;
  const eye = new Vec3(s.pos.x, s.pos.y + 1.7, s.pos.z);
  assert.equal(m.combat.throwGrenade(s, eye, new Vec3(0, 0.1, -1).normalize()), true);
  assert.equal(s.slots[0].count, 1);
  assert.equal(m.combat.throwGrenade(s, eye, new Vec3(0, 0.1, -1).normalize()), false, 'cooldown');
  assert.ok(m.events.some((e) => e.type === 'projSpawn'));
  for (let t = 0; t < GRENADE.fuse + 0.5; t += 1 / 30) {
    m.combat.update(1 / 30);
  }
  const types = m.events.map((e) => e.type);
  assert.ok(types.includes('projEnd'));
  assert.ok(types.includes('explosion'));
  assert.equal(m.combat.grenades.length, 0);
});

test('supply drops fall, cannot be opened while falling, then hold top-tier loot', () => {
  const m = new Match({ seed: 4, botCount: 0 });
  const c = m.loot.addSupplyDrop(0, 0);
  assert.ok(c.falling && c.pos.y > c.landY + 50);
  assert.equal(m.loot.nearestChest(new Vec3(c.pos.x, c.pos.y, c.pos.z), 5), null);
  m.loot.openChest(c);
  assert.equal(c.opened, false, 'cannot open in the air');
  const seconds = SUPPLY.height / SUPPLY.fallSpeed + 2;
  for (let t = 0; t < seconds; t += 1 / 30) m.loot.update(1 / 30);
  assert.equal(c.falling, false);
  assert.ok(Math.abs(c.pos.y - c.landY) < 0.01);
  const before = m.loot.pickups.length;
  m.loot.openChest(c);
  const dropped = m.loot.pickups.slice(before);
  const gun = dropped.find((p) => p.item.kind === 'weapon');
  assert.ok(gun && gun.item.rarity >= 3, 'supply guns are Epic or better');
  assert.ok(dropped.some((p) => p.item.type === 'grenade'));
});

test('dropping the selected item puts it on the floor and empties the slot', async () => {
  const { applyCommand, emptyCommand, ACT } = await import('../shared/sim/controller.js');
  const m = new Match({ seed: 4, botCount: 0 });
  const s = m.addHuman('Tester');
  s.state = 'ground'; s.onGround = true; s.pos.set(-60, 5, 60);
  s.slots[0] = { kind: 'weapon', type: 'ar', rarity: 2, mag: 30 };
  s.selected = 1;
  const cmd = { ...emptyCommand(), act: ACT.DROP };
  const before = m.loot.pickups.length;
  applyCommand(m, s, cmd, 1 / 30);
  assert.equal(s.slots[0], null);
  assert.equal(m.loot.pickups.length, before + 1);
  assert.equal(m.loot.pickups[before].item.type, 'ar');
});
