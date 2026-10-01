// Floor loot, chests and ammo boxes, plus the item pickups that drop from
// them and from eliminated players.
import * as THREE from 'three';
import { WEAPONS, CONSUMABLES, RARITIES, AMMO, LOOT_WEIGHTS } from './config.js';
import { weightedIndex, rand, pick } from './util.js';
import { glowTexture } from './textures.js';

const WEAPON_WEIGHTS = { ar: 30, smg: 20, pump: 22, pistol: 16, sniper: 8, rocket: 4 };
const CONSUMABLE_WEIGHTS = { bandage: 30, minis: 30, medkit: 14, bigpot: 18, chug: 4 };

export function rollWeapon(table = 'floor') {
  const types = Object.keys(WEAPON_WEIGHTS);
  const type = types[weightedIndex(types.map((t) => WEAPON_WEIGHTS[t]))];
  let rarity = weightedIndex(LOOT_WEIGHTS[table]);
  const dmg = WEAPONS[type].damage;
  while (dmg[rarity] == null && rarity < 4) rarity++;
  return { kind: 'weapon', type, rarity, mag: WEAPONS[type].mag };
}

export function rollConsumable() {
  const types = Object.keys(CONSUMABLE_WEIGHTS);
  const type = types[weightedIndex(types.map((t) => CONSUMABLE_WEIGHTS[t]))];
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

const MAT_COLORS = { wood: '#b5763d', brick: '#c0563b', metal: '#9aa5b1' };
const CONS_COLORS = { bandage: '#f5f5f5', medkit: '#e74c3c', minis: '#5dade2', bigpot: '#2e86de', chug: '#48c9b0' };

export class LootSystem {
  constructor(scene, collision) {
    this.scene = scene;
    this.col = collision;
    this.pickups = [];
    this.chests = [];
    this.beamGeo = new THREE.CylinderGeometry(0.12, 0.35, 3, 8, 1, true);
    this.beamGeo.translate(0, 1.5, 0);
    this.ringGeo = new THREE.RingGeometry(0.35, 0.6, 20).rotateX(-Math.PI / 2);
    this.beamMats = RARITIES.map((r) => new THREE.MeshBasicMaterial({
      color: r.color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.sparkle = new THREE.SpriteMaterial({ map: glowTexture('#fff3a0'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  }

  spawnFromSpots(spots) {
    for (const s of spots) {
      if (s.type === 'chest') this.addChest(s.x, s.y, s.z, 'chest');
      else if (s.type === 'ammo') this.addChest(s.x, s.y, s.z, 'ammo');
      else if (Math.random() < 0.8) {
        const p = new THREE.Vector3(s.x, s.y, s.z);
        if (Math.random() < 0.62) {
          const w = rollWeapon('floor');
          this.drop(w, p, false);
          this.drop(ammoFor(w.type), p.clone().add(new THREE.Vector3(0.8, 0, 0.3)), false);
        } else {
          this.drop(rollConsumable(), p, false);
        }
      }
    }
  }

  addChest(x, y, z, type) {
    const g = new THREE.Group();
    let lid;
    if (type === 'chest') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.7), this.lam('#c8901e'));
      base.position.y = 0.28;
      lid = new THREE.Group();
      lid.position.set(0, 0.55, 0.35);
      const lm = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.25, 0.72), this.lam('#f4c430'));
      lm.position.set(0, 0.12, -0.35);
      lid.add(lm);
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.05), this.lam('#7a4b0c'));
      lock.position.set(0, 0.45, -0.37);
      g.add(base, lid, lock);
      const sp = new THREE.Sprite(this.sparkle);
      sp.scale.set(1.6, 1.6, 1);
      sp.position.y = 0.8;
      g.add(sp);
      g.userData.sparkle = sp;
    } else {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.5), this.lam('#6b7d4f'));
      base.position.y = 0.23;
      lid = new THREE.Group();
      lid.position.set(0, 0.45, 0.25);
      const lm = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.52), this.lam('#8a9a64'));
      lm.position.set(0, 0.06, -0.25);
      lid.add(lm);
      g.add(base, lid);
    }
    g.position.set(x, y, z);
    g.rotation.y = rand(0, Math.PI * 2);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
    this.chests.push({ type, pos: new THREE.Vector3(x, y, z), mesh: g, lid, opened: false, openT: 0 });
  }

  openChest(c) {
    if (c.opened) return;
    c.opened = true;
    const p = c.pos.clone().add(new THREE.Vector3(0, 0.6, 0));
    if (c.type === 'chest') {
      const w = rollWeapon('chest');
      this.drop(w, p, true);
      this.drop(ammoFor(w.type, 2), p, true);
      this.drop(rollConsumable(), p, true);
      this.drop({ kind: 'mat', type: pick(['wood', 'wood', 'brick', 'metal']), count: 30 }, p, true);
      if (c.mesh.userData.sparkle) c.mesh.userData.sparkle.visible = false;
    } else {
      const types = Object.keys(AMMO).filter((a) => a !== 'rockets' || Math.random() < 0.3);
      for (let i = 0; i < 2; i++) {
        const a = pick(types);
        this.drop({ kind: 'ammo', type: a, count: AMMO[a].drop * 2 }, p, true);
      }
    }
  }

  makeMesh(item) {
    const g = new THREE.Group();
    const rarity = itemRarity(item);
    if (item.kind === 'weapon') {
      const len = { ar: 0.9, pump: 0.95, smg: 0.6, pistol: 0.4, sniper: 1.3, rocket: 1.2 }[item.type];
      const thick = item.type === 'rocket' ? 0.24 : 0.14;
      const body = new THREE.Mesh(new THREE.BoxGeometry(len, thick + 0.04, thick), this.lam('#2d3436'));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(len * 0.6, 0.06, thick + 0.02), this.lam(RARITIES[rarity].color));
      stripe.position.y = thick / 2 + 0.03;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), this.lam('#2d3436'));
      grip.position.set(len * 0.15, -0.15, 0);
      g.add(body, stripe, grip);
    } else if (item.kind === 'consumable') {
      const c = CONS_COLORS[item.type];
      const m = item.type === 'bandage'
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.25, 10), this.lam(c))
        : item.type === 'medkit'
          ? new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.2), this.lam(c))
          : new THREE.Mesh(new THREE.SphereGeometry(item.type === 'minis' ? 0.16 : 0.24, 10, 8), this.lam(c));
      g.add(m);
    } else if (item.kind === 'ammo') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.24), this.lam(AMMO[item.type].color));
      g.add(m);
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), this.lam(MAT_COLORS[item.type]));
      g.add(m);
    }
    const inner = g;
    const root = new THREE.Group();
    root.add(inner);
    inner.position.y = 0.45;
    if (item.kind === 'weapon' || item.kind === 'consumable') {
      const beam = new THREE.Mesh(this.beamGeo, this.beamMats[rarity]);
      const ring = new THREE.Mesh(this.ringGeo, this.beamMats[rarity]);
      ring.position.y = 0.03;
      root.add(beam, ring);
    }
    return { root, inner };
  }

  drop(item, pos, toss = true) {
    const { root, inner } = this.makeMesh(item);
    root.position.copy(pos);
    this.scene.add(root);
    const vel = toss ? new THREE.Vector3(rand(-3, 3), rand(3, 5), rand(-3, 3)) : new THREE.Vector3();
    const p = { item, pos: root.position, vel, mesh: root, inner, settled: !toss, age: 0, phase: Math.random() * 6 };
    if (!toss) {
      p.pos.y = this.col.groundHeight(p.pos.x, p.pos.z, p.pos.y + 0.6, 0.2);
    }
    this.pickups.push(p);
    return p;
  }

  remove(p) {
    const i = this.pickups.indexOf(p);
    if (i >= 0) this.pickups.splice(i, 1);
    this.scene.remove(p.mesh);
  }

  update(dt, time) {
    for (const p of this.pickups) {
      p.age += dt;
      if (!p.settled) {
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
      p.inner.rotation.y = time * 1.5 + p.phase;
      p.inner.position.y = 0.45 + Math.sin(time * 2 + p.phase) * 0.08;
    }
    for (const c of this.chests) {
      if (c.opened && c.openT < 1) {
        c.openT = Math.min(1, c.openT + dt * 3);
        c.lid.rotation.x = -c.openT * 1.6;
      }
      const sp = c.mesh.userData.sparkle;
      if (sp && sp.visible) {
        const s = 1.2 + Math.sin(time * 5 + c.pos.x) * 0.4;
        sp.scale.set(s, s, 1);
      }
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

  clearAll() {
    for (const p of this.pickups) this.scene.remove(p.mesh);
    for (const c of this.chests) this.scene.remove(c.mesh);
    this.pickups = [];
    this.chests = [];
  }
}
