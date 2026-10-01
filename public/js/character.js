// Characters: the blocky Fortnite-style model plus the Fighter state shared by
// the player and the bots (health, shield, inventory, ammo, materials).
import * as THREE from 'three';
import { PLAYER, WEAPONS, CONSUMABLES, RARITIES, MAX_MATS, AMMO } from './config.js';

const box = (w, h, d, color) => new THREE.Mesh(
  new THREE.BoxGeometry(w, h, d),
  new THREE.MeshLambertMaterial({ color }),
);

export const OUTFITS = [
  { shirt: '#2e86de', pants: '#34495e', skin: '#f2c49b', hair: '#5b3a1e', pack: '#e67e22' },
  { shirt: '#e74c3c', pants: '#2c3e50', skin: '#c68642', hair: '#111111', pack: '#f1c40f' },
  { shirt: '#27ae60', pants: '#6d4c41', skin: '#f5d0b0', hair: '#d4a017', pack: '#8e44ad' },
  { shirt: '#8e44ad', pants: '#1c2833', skin: '#8d5524', hair: '#222222', pack: '#1abc9c' },
  { shirt: '#f39c12', pants: '#5d6d7e', skin: '#ffdbac', hair: '#b03a2e', pack: '#2e86de' },
  { shirt: '#16a085', pants: '#4a235a', skin: '#e0ac69', hair: '#3e2723', pack: '#e74c3c' },
  { shirt: '#ecf0f1', pants: '#c0392b', skin: '#f1c27d', hair: '#4e342e', pack: '#2c3e50' },
  { shirt: '#ff6fb5', pants: '#283747', skin: '#c68642', hair: '#f7dc6f', pack: '#58d68d' },
];

const gunCache = new Map();
export function gunMesh(type, rarity) {
  const key = `${type}:${rarity}`;
  if (gunCache.has(key)) return gunCache.get(key).clone();
  const g = new THREE.Group();
  const dark = '#2d3436';
  const rc = RARITIES[rarity].color;
  const add = (w, h, d, x, y, z, c) => { const m = box(w, h, d, c); m.position.set(x, y, z); g.add(m); };
  switch (type) {
    case 'ar': add(0.12, 0.16, 0.85, 0, 0, -0.25, dark); add(0.13, 0.06, 0.5, 0, 0.1, -0.2, rc); add(0.08, 0.22, 0.1, 0, -0.15, -0.1, dark); add(0.1, 0.12, 0.25, 0, 0, 0.25, rc); break;
    case 'pump': add(0.13, 0.13, 0.9, 0, 0, -0.3, '#6d4c41'); add(0.1, 0.1, 0.7, 0, 0.1, -0.35, dark); add(0.14, 0.08, 0.3, 0, -0.05, -0.55, rc); break;
    case 'smg': add(0.12, 0.16, 0.55, 0, 0, -0.15, dark); add(0.13, 0.05, 0.4, 0, 0.1, -0.15, rc); add(0.07, 0.25, 0.08, 0, -0.18, -0.2, dark); break;
    case 'pistol': add(0.1, 0.12, 0.35, 0, 0.02, -0.12, dark); add(0.11, 0.05, 0.3, 0, 0.09, -0.12, rc); add(0.08, 0.18, 0.08, 0, -0.1, 0, dark); break;
    case 'sniper': add(0.11, 0.13, 1.25, 0, 0, -0.4, '#5d4037'); add(0.08, 0.08, 0.4, 0, 0.14, -0.3, '#111'); add(0.12, 0.05, 0.6, 0, -0.08, -0.2, rc); break;
    case 'rocket': add(0.24, 0.24, 1.2, 0, 0.05, -0.2, '#556b2f'); add(0.26, 0.08, 0.5, 0, 0.2, -0.2, rc); break;
    default: break;
  }
  gunCache.set(key, g);
  return g.clone();
}

function pickaxeMesh() {
  const g = new THREE.Group();
  const handle = box(0.07, 0.07, 1.0, '#8d6e63');
  handle.position.z = -0.35;
  const head = box(0.08, 0.6, 0.12, '#9ad0ec');
  head.position.set(0, 0, -0.8);
  const tip = box(0.06, 0.14, 0.1, '#e3f4ff');
  tip.position.set(0, 0.34, -0.8);
  g.add(handle, head, tip);
  return g;
}

function gliderMesh(color) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-1.9, 0); shape.lineTo(0, 0.8); shape.lineTo(1.9, 0); shape.lineTo(0, -0.5); shape.lineTo(-1.9, 0);
  const wing = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }),
  );
  wing.rotation.x = -Math.PI / 2;
  wing.position.y = 2.9;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 1.3), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
  stripe.position.set(0, 2.92, 0.1);
  g.add(wing, stripe);
  for (const x of [-0.9, 0.9]) {
    const strut = box(0.03, 1.3, 0.03, '#333');
    strut.position.set(x * 0.4, 2.25, 0);
    strut.rotation.z = x > 0 ? 0.4 : -0.4;
    g.add(strut);
  }
  return g;
}

export function buildModel(outfit) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // tilts for skydiving
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.9;
  body.add(hips);

  const legL = new THREE.Group(), legR = new THREE.Group();
  for (const [leg, x] of [[legL, -0.15], [legR, 0.15]]) {
    leg.position.set(x, 0, 0);
    const m = box(0.24, 0.9, 0.28, outfit.pants);
    m.position.y = -0.45;
    const shoe = box(0.26, 0.14, 0.36, '#222');
    shoe.position.set(0, -0.86, -0.04);
    leg.add(m, shoe);
    hips.add(leg);
  }
  const torso = box(0.58, 0.66, 0.32, outfit.shirt);
  torso.position.y = 0.33;
  hips.add(torso);
  const belt = box(0.6, 0.08, 0.34, '#3b2f2f');
  belt.position.y = 0.02;
  hips.add(belt);
  const pack = box(0.42, 0.46, 0.2, outfit.pack);
  pack.position.set(0, 0.36, 0.26);
  hips.add(pack);

  const head = new THREE.Group();
  head.position.y = 0.66;
  const skull = box(0.38, 0.38, 0.38, outfit.skin);
  skull.position.y = 0.22;
  const hair = box(0.41, 0.14, 0.41, outfit.hair);
  hair.position.y = 0.42;
  const fringe = box(0.41, 0.08, 0.1, outfit.hair);
  fringe.position.set(0, 0.36, -0.17);
  const eyeL = box(0.06, 0.06, 0.02, '#111'), eyeR = box(0.06, 0.06, 0.02, '#111');
  eyeL.position.set(-0.09, 0.24, -0.195); eyeR.position.set(0.09, 0.24, -0.195);
  head.add(skull, hair, fringe, eyeL, eyeR);
  hips.add(head);

  const armL = new THREE.Group(), armR = new THREE.Group();
  for (const [arm, x] of [[armL, -0.38], [armR, 0.38]]) {
    arm.position.set(x, 0.6, 0);
    const sleeve = box(0.18, 0.3, 0.2, outfit.shirt);
    sleeve.position.y = -0.14;
    const fore = box(0.16, 0.36, 0.18, outfit.skin);
    fore.position.y = -0.46;
    arm.add(sleeve, fore);
    hips.add(arm);
  }
  const hand = new THREE.Group();
  hand.position.set(0, -0.62, 0);
  armR.add(hand);

  const glider = gliderMesh(outfit.pack);
  glider.visible = false;
  root.add(glider);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, body, hips, legL, legR, armL, armR, head, hand, glider, held: null, heldKey: '' };
}

let fighterId = 1;

export class Fighter {
  constructor(scene, name, isPlayer, outfit) {
    this.id = fighterId++;
    this.name = name;
    this.isPlayer = isPlayer;
    this.scene = scene;
    this.outfit = outfit;
    this.model = buildModel(outfit);
    scene.add(this.model.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.radius = PLAYER.radius;
    this.height = PLAYER.height;
    this.reset();
    this.kills = 0;
    this.eliminated = false;
  }

  reset() {
    this.hp = PLAYER.maxHealth;
    this.shield = PLAYER.maxShield;
    this.alive = true;
    this.state = 'bus';
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.slots = [null, null, null, null, null];
    this.selected = 0; // 0 = pickaxe, 1..5 = slots
    this.ammo = { light: 0, medium: 0, heavy: 0, shells: 0, rockets: 0 };
    this.mats = { wood: 0, brick: 0, metal: 0 };
    this.fireCd = 0;
    this.reloadT = 0;
    this.bloom = 0;
    this.heal = null;
    this.swingT = 0;
    this.walkPhase = 0;
    this.flash = 0;
    this.lastHitBy = null;
    this.model.root.visible = true;
  }

  get item() {
    return this.selected === 0 ? null : this.slots[this.selected - 1];
  }

  get weapon() {
    const it = this.item;
    return it && it.kind === 'weapon' ? it : null;
  }

  hitboxes() {
    const p = this.pos;
    if (this.state === 'skydive' || this.state === 'glide') {
      return { body: { min: { x: p.x - 0.6, y: p.y + 0.3, z: p.z - 0.6 }, max: { x: p.x + 0.6, y: p.y + 1.5, z: p.z + 0.6 } }, head: null };
    }
    return {
      body: { min: { x: p.x - 0.42, y: p.y, z: p.z - 0.42 }, max: { x: p.x + 0.42, y: p.y + 1.48, z: p.z + 0.42 } },
      head: { min: { x: p.x - 0.26, y: p.y + 1.48, z: p.z - 0.26 }, max: { x: p.x + 0.26, y: p.y + 1.98, z: p.z + 0.26 } },
    };
  }

  // Add an item. Returns whatever could not be taken (or null).
  give(item) {
    if (item.kind === 'ammo') {
      const max = AMMO[item.type].max;
      this.ammo[item.type] = Math.min(max, this.ammo[item.type] + item.count);
      return null;
    }
    if (item.kind === 'mat') {
      this.mats[item.type] = Math.min(MAX_MATS, this.mats[item.type] + item.count);
      return null;
    }
    if (item.kind === 'consumable') {
      const spec = CONSUMABLES[item.type];
      let left = item.count;
      for (const s of this.slots) {
        if (s && s.kind === 'consumable' && s.type === item.type && s.count < spec.stack) {
          const n = Math.min(left, spec.stack - s.count);
          s.count += n;
          left -= n;
          if (!left) return null;
        }
      }
      const empty = this.slots.indexOf(null);
      if (empty >= 0) {
        this.slots[empty] = { ...item, count: Math.min(left, spec.stack) };
        left -= Math.min(left, spec.stack);
        return left > 0 ? { ...item, count: left } : null;
      }
      return { ...item, count: left };
    }
    const empty = this.slots.indexOf(null);
    if (empty >= 0) {
      this.slots[empty] = item;
      return null;
    }
    return item;
  }

  hasRoomFor(item) {
    if (item.kind === 'ammo' || item.kind === 'mat') return true;
    if (this.slots.includes(null)) return true;
    if (item.kind === 'consumable') {
      const spec = CONSUMABLES[item.type];
      return this.slots.some((s) => s && s.kind === 'consumable' && s.type === item.type && s.count < spec.stack);
    }
    return false;
  }

  select(i) {
    if (i === this.selected) return;
    this.selected = i;
    this.reloadT = 0;
    this.heal = null;
    this.fireCd = Math.max(this.fireCd, 0.25); // equip time
  }

  // Everything this fighter drops when eliminated.
  dropAll() {
    const out = [];
    for (const s of this.slots) if (s) out.push(s);
    for (const [k, v] of Object.entries(this.ammo)) if (v > 0) out.push({ kind: 'ammo', type: k, count: v });
    for (const [k, v] of Object.entries(this.mats)) if (v > 0) out.push({ kind: 'mat', type: k, count: v });
    this.slots = [null, null, null, null, null];
    this.ammo = { light: 0, medium: 0, heavy: 0, shells: 0, rockets: 0 };
    this.mats = { wood: 0, brick: 0, metal: 0 };
    return out;
  }

  updateModel(dt, time) {
    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;

    // What's in hand.
    const w = this.weapon;
    let heldKey = w ? `${w.type}:${w.rarity}` : (this.selected === 0 ? 'pick' : (this.item ? 'item' : ''));
    if (this.state === 'skydive' || this.state === 'glide' || this.state === 'bus') heldKey = '';
    if (heldKey !== m.heldKey) {
      if (m.held) m.hand.remove(m.held);
      m.held = null;
      if (heldKey === 'pick') m.held = pickaxeMesh();
      else if (w && heldKey) m.held = gunMesh(w.type, w.rarity);
      else if (heldKey === 'item') {
        const it = this.item;
        m.held = box(0.22, 0.22, 0.22, it.type === 'bandage' ? '#f5f5f5' : it.type === 'medkit' ? '#e74c3c' : it.type === 'chug' ? '#3fa6f2' : '#4aa3ff');
      }
      if (m.held) {
        m.held.rotation.x = -Math.PI / 2;
        m.hand.add(m.held);
      }
      m.heldKey = heldKey;
    }
    
    const speed = Math.hypot(this.vel.x, this.vel.z);
    m.glider.visible = this.state === 'glide';
    m.body.rotation.x = 0;
    m.body.position.y = 0;

    if (this.state === 'skydive') {
      m.body.rotation.x = -1.25;
      m.body.position.y = 1.0;
      m.armL.rotation.set(0, 0, 1.4 + Math.sin(time * 8) * 0.1);
      m.armR.rotation.set(0, 0, -1.4 - Math.sin(time * 8) * 0.1);
      m.legL.rotation.x = 0.3; m.legR.rotation.x = 0.4;
      return;
    }
    if (this.state === 'glide') {
      m.armL.rotation.set(0, 0, 2.6);
      m.armR.rotation.set(0, 0, -2.6);
      m.legL.rotation.x = 0.15; m.legR.rotation.x = -0.1;
      return;
    }

    if (speed > 0.5 && this.onGround) this.walkPhase += dt * speed * 1.6;
    else this.walkPhase *= 0.9;
    const s = Math.sin(this.walkPhase) * Math.min(1, speed / 5);
    m.legL.rotation.x = s * 0.7;
    m.legR.rotation.x = -s * 0.7;
    if (!this.onGround && !this.swimming) { m.legL.rotation.x = -0.5; m.legR.rotation.x = 0.3; }

    // Arms: aim the gun along pitch, or swing the pickaxe.
    m.armL.rotation.set(0, 0, 0);
    m.armR.rotation.set(0, 0, 0);
    if (this.selected === 0) {
      const sw = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.35) * Math.PI) : 0;
      m.armR.rotation.x = 0.6 + sw * 1.9 + (this.swingT > 0 ? 0 : s * 0.3);
      m.armL.rotation.x = -s * 0.5;
    } else {
      const aim = Math.PI / 2 + this.pitch;
      m.armR.rotation.x = aim;
      m.armL.rotation.x = aim;
      m.armL.rotation.z = -0.5;
    }
    m.head.rotation.x = this.pitch * 0.5;
  }

  remove() {
    this.scene.remove(this.model.root);
  }
}
