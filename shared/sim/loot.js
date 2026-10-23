// Floor loot, chests and ammo boxes, plus the pickups that drop from them and
// from eliminated players. Pure simulation: the renderer draws pickups and
// chests from `pickups` / `chests` and listens for loot events.
import { WEAPONS, CONSUMABLES, RARITIES, AMMO, LOOT_WEIGHTS } from '../config.js';
import { Vec3 } from '../math/vec3.js';

const WEAPON_WEIGHTS = { ar: 30, smg: 20, pump: 22, pistol: 16, sniper: 8, rocket: 4 };
const CONSUMABLE_WEIGHTS = { bandage: 30, minis: 30, medkit: 14, bigpot: 18, chug: 4 };

export function rollWeapon(rng, table = 'floor') {
  const types = Object.keys(WEAPON_WEIGHTS);
  const type = types[rng.weighted(types.map((t) => WEAPON_WEIGHTS[t]))];
  let rarity = rng.weighted(LOOT_WEIGHTS[table]);
  const dmg = WEAPONS[type].damage;
  while (dmg[rarity] == null && rarity < 4) rarity++;
  return { kind: 'weapon', type, rarity, mag: WEAPONS[type].mag };
}

export function rollConsumable(rng) {
  const types = Object.keys(CONSUMABLE_WEIGHTS);
  const type = types[rng.weighted(types.map((t) => CONSUMABLE_WEIGHTS[t]))];
  return { kind: 'consumable', type, count: CONSUMABLES[type].pickup };
}

export function ammoFor(type, mult = 1) {
  const a = WEAPONS[type].ammo;
  return { kind: 'ammo', type: a, count: AMMO[a].drop * mult };
}

export function itemName(it) {
  if (it.kind === 'weapon') return `${RARITIES[it.rarity].name} ${WEAPONS[it.type].name}`;
  if (it.kind === 'consumable') return `${CONSUMABLES[it.type].name} x${it.count}`;
  if (it.kind === 'ammo') return `${AMMO[it.type].name} x${it.count}`;
  return `${it.type[0].toUpperCase() + it.type.slice(1)} x${it.count}`;
}

export function itemRarity(it) {
  if (it.kind === 'weapon') return it.rarity;
  if (it.kind === 'consumable') return CONSUMABLES[it.type].rarity;
  return 0;
}

export class LootSystem {
  // emit: 'pickupSpawned', 'pickupRemoved', 'chestPlaced', 'chestOpened'.
  constructor(collision, rng, emit = () => {}) {
    this.col = collision;
    this.rng = rng;
    this.emit = emit;
    this.pickups = [];
    this.chests = [];
    this.nextId = 1;
  }

  spawnFromSpots(spots) {
    const r = this.rng;
    for (const s of spots) {
      if (s.type === 'chest') this.addChest(s.x, s.y, s.z, 'chest');
      else if (s.type === 'ammo') this.addChest(s.x, s.y, s.z, 'ammo');
      else if (r.random() < 0.8) {
        const p = new Vec3(s.x, s.y, s.z);
        if (r.random() < 0.62) {
          const w = rollWeapon(r, 'floor');
          this.drop(w, p, false);
          this.drop(ammoFor(w.type), p.clone().add(new Vec3(0.8, 0, 0.3)), false);
        } else {
          this.drop(rollConsumable(r), p, false);
        }
      }
    }
  }

  addChest(x, y, z, type) {
    const c = { id: this.nextId++, type, pos: new Vec3(x, y, z), rot: this.rng.range(0, Math.PI * 2), opened: false };
    this.chests.push(c);
    this.emit('chestPlaced', { c });
    return c;
  }

  openChest(c) {
    if (c.opened) return;
    c.opened = true;
    const r = this.rng;
    const p = c.pos.clone().add(new Vec3(0, 0.6, 0));
    if (c.type === 'chest') {
      const w = rollWeapon(r, 'chest');
      this.drop(w, p, true);
      this.drop(ammoFor(w.type, 2), p, true);
      this.drop(rollConsumable(r), p, true);
      this.drop({ kind: 'mat', type: r.pick(['wood', 'wood', 'brick', 'metal']), count: 30 }, p, true);
    } else {
      const types = Object.keys(AMMO).filter((a) => a !== 'rockets' || r.random() < 0.3);
      for (let i = 0; i < 2; i++) {
        const a = r.pick(types);
        this.drop({ kind: 'ammo', type: a, count: AMMO[a].drop * 2 }, p, true);
      }
    }
    this.emit('chestOpened', { c });
  }

  drop(item, pos, toss = true) {
    const r = this.rng;
    const vel = toss ? new Vec3(r.range(-3, 3), r.range(3, 5), r.range(-3, 3)) : new Vec3();
    const p = { id: this.nextId++, item, pos: pos.clone(), vel, settled: !toss, age: 0, phase: r.random() * 6 };
    if (!toss) p.pos.y = this.col.groundHeight(p.pos.x, p.pos.z, p.pos.y + 0.6, 0.2);
    this.pickups.push(p);
    this.emit('pickupSpawned', { pk: p });
    return p;
  }

  remove(p) {
    const i = this.pickups.indexOf(p);
    if (i >= 0) this.pickups.splice(i, 1);
    this.emit('pickupRemoved', { pk: p });
  }

  update(dt) {
    for (const p of this.pickups) {
      p.age += dt;
      if (p.settled) continue;
      p.vel.y -= 20 * dt;
      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;
      const ny = p.pos.y + p.vel.y * dt;
      const g = this.col.groundHeight(p.pos.x, p.pos.z, p.pos.y + 0.3, 0.15);
      if (ny <= g) {
        p.pos.y = Math.max(g, 0);
        p.settled = true;
      } else p.pos.y = ny;
    }
  }

  nearestPickup(pos, maxDist, filter) {
    let best = null, bd = maxDist;
    for (const p of this.pickups) {
      if (filter && !filter(p)) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y, p.pos.z - pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  nearestChest(pos, maxDist) {
    let best = null, bd = maxDist;
    for (const c of this.chests) {
      if (c.opened) continue;
      const d = Math.hypot(c.pos.x - pos.x, (c.pos.y - pos.y) * 1.5, c.pos.z - pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
}
