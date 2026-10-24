// Held items (guns, pickaxe, glider) and FighterView: the bridge from a sim
// Fighter to a skinned, animated character. The sim knows nothing about meshes.
import * as THREE from 'three';
import { RARITIES } from '/shared/config.js';
import { item } from '/shared/cosmetics/catalog.js';
import { buildRig } from './rig.js';
import { pickaxeMesh, gliderMesh, wrapMaterial } from './cosmetics.js';
import { Animator } from './animator.js';

const box = (w, h, d, color) => new THREE.Mesh(
  new THREE.BoxGeometry(w, h, d),
  new THREE.MeshLambertMaterial({ color }),
);

const gunCache = new Map();
export function gunMesh(type, rarity, wrapId = null) {
  const wrap = wrapId ? item(wrapId) : null;
  const wrapMat = wrap ? wrapMaterial(wrap.spec) : null;
  const key = `${type}:${rarity}:${wrapId || ''}`;
  if (gunCache.has(key)) return gunCache.get(key).clone();
  const g = new THREE.Group();
  const dark = '#2d3436';
  const rc = RARITIES[rarity].color;
  const add = (w, h, d, x, y, z, c) => {
    const m = box(w, h, d, c);
    // Wraps cover the body of the gun; the rarity-coloured trim and optics stay.
    if (wrapMat && c !== rc && c !== '#111') m.material = wrapMat;
    m.position.set(x, y, z);
    g.add(m);
  };
  switch (type) {
    case 'ar': add(0.12, 0.16, 0.85, 0, 0, -0.25, dark); add(0.13, 0.06, 0.5, 0, 0.1, -0.2, rc); add(0.08, 0.22, 0.1, 0, -0.15, -0.1, dark); add(0.1, 0.12, 0.25, 0, 0, 0.25, rc); break;
    case 'pump': add(0.13, 0.13, 0.9, 0, 0, -0.3, '#6d4c41'); add(0.1, 0.1, 0.7, 0, 0.1, -0.35, dark); add(0.14, 0.08, 0.3, 0, -0.05, -0.55, rc); break;
    case 'smg': add(0.12, 0.16, 0.55, 0, 0, -0.15, dark); add(0.13, 0.05, 0.4, 0, 0.1, -0.15, rc); add(0.07, 0.25, 0.08, 0, -0.18, -0.2, dark); break;
    case 'pistol': add(0.1, 0.12, 0.35, 0, 0.02, -0.12, dark); add(0.11, 0.05, 0.3, 0, 0.09, -0.12, rc); add(0.08, 0.18, 0.08, 0, -0.1, 0, dark); break;
    case 'sniper': add(0.11, 0.13, 1.25, 0, 0, -0.4, '#5d4037'); add(0.08, 0.08, 0.4, 0, 0.14, -0.3, '#111'); add(0.12, 0.05, 0.6, 0, -0.08, -0.2, rc); break;
    case 'rocket': add(0.24, 0.24, 1.2, 0, 0.05, -0.2, '#556b2f'); add(0.26, 0.08, 0.5, 0, 0.2, -0.2, rc); break;
    case 'tac': add(0.14, 0.14, 0.95, 0, 0, -0.3, '#37474f'); add(0.11, 0.1, 0.6, 0, 0.1, -0.35, dark); add(0.15, 0.09, 0.28, 0, -0.04, -0.6, rc); add(0.1, 0.12, 0.3, 0, 0, 0.3, '#5d4037'); break;
    case 'burst': add(0.11, 0.15, 0.8, 0, 0, -0.22, '#455a64'); add(0.12, 0.05, 0.55, 0, 0.1, -0.2, rc); add(0.07, 0.2, 0.09, 0, -0.14, -0.05, dark); add(0.1, 0.12, 0.28, 0, 0, 0.27, rc); add(0.05, 0.05, 0.3, 0, 0.04, -0.75, dark); break;
    case 'dmr': add(0.1, 0.13, 1.05, 0, 0, -0.32, '#4e342e'); add(0.1, 0.1, 0.34, 0, 0.14, -0.28, '#111'); add(0.11, 0.05, 0.5, 0, -0.08, -0.15, rc); add(0.08, 0.2, 0.08, 0, -0.14, 0.0, dark); break;
    case 'revolver': add(0.1, 0.12, 0.45, 0, 0.03, -0.18, '#546e7a'); add(0.14, 0.14, 0.14, 0, 0.0, -0.05, rc); add(0.08, 0.2, 0.09, 0, -0.12, 0.05, '#4e342e'); break;
    default: break;
  }
  gunCache.set(key, g);
  return g.clone();
}

// Distance bands: full detail and foot IK, reduced animation rate, then a stand-in.
let LOD_NEAR = 40;
let LOD_FAR = 150;
export function setLodDistances(near, far) { LOD_NEAR = near; LOD_FAR = far; }

export class FighterView {
  constructor(scene, fighter, { groundAt = null } = {}) {
    this.scene = scene;
    this.f = fighter;
    this.rig = buildRig(fighter.outfit);
    this.animator = new Animator(this.rig, groundAt);
    scene.add(this.rig.root);
    this.glider = gliderMesh(fighter.loadout && fighter.loadout.glider);
    this.glider.visible = false;
    this.rig.root.add(this.glider);
    this.held = null;
    this.heldKey = '';
    this.local = false;
    this.pending = 0; // time banked while animation is throttled
    this.model = { root: this.rig.root }; // kept for callers that only need the root
  }

  // alpha: how far between the previous and current sim tick. cam: camera position for LOD.
  update(dt, time, alpha, cam) {
    const f = this.f;
    const root = this.rig.root;
    root.visible = f.alive && !f.hidden && f.state !== 'bus';
    this.rig.mesh.visible = !(this.local && f.scoped);
    if (!root.visible) return;
    const x = f.prev.x + (f.pos.x - f.prev.x) * alpha + f.smooth.x;
    const y = f.prev.y + (f.pos.y - f.prev.y) * alpha + f.smooth.y;
    const z = f.prev.z + (f.pos.z - f.prev.z) * alpha + f.smooth.z;
    root.position.set(x, y, z);
    root.rotation.y = f.yaw;

    const d = cam ? Math.hypot(cam.x - x, cam.y - y, cam.z - z) : 0;
    const level = this.local || d < LOD_NEAR ? 0 : d < LOD_FAR ? 1 : 2;
    this.rig.lod.visible = level === 2;
    this.rig.mesh.visible = this.rig.mesh.visible && level < 2;
    this.glider.visible = f.state === 'glide';
    if (level === 2) return;

    this.syncHeld();
    // Mid-range characters animate at half rate; they are small on screen.
    this.pending += dt;
    if (level === 1 && this.pending < 1 / 30) return;
    this.animator.update(this.pending, f, level);
    if (this.rig.fxUpdate) this.rig.fxUpdate(time);
    this.pending = 0;
  }

  syncHeld() {
    const f = this.f;
    const w = f.weapon;
    const lo = f.loadout || {};
    let key = w ? `${w.type}:${w.rarity}:${lo.wrap || ''}` : (f.selected === 0 ? `pick:${lo.pickaxe || ''}` : (f.item ? 'item' : ''));
    if (f.airborne || f.state === 'bus' || f.emote > 0) key = '';
    if (key === this.heldKey) return;
    const sock = this.rig.sockets.right;
    if (this.held) sock.remove(this.held);
    this.held = null;
    if (key.startsWith('pick')) this.held = pickaxeMesh(lo.pickaxe);
    else if (w && key) this.held = gunMesh(w.type, w.rarity, lo.wrap);
    else if (key === 'item') {
      const it = f.item;
      this.held = box(0.22, 0.22, 0.22, it.type === 'bandage' ? '#f5f5f5' : it.type === 'medkit' ? '#e74c3c' : it.type === 'chug' ? '#3fa6f2' : '#4aa3ff');
    }
    if (this.held) {
      this.held.rotation.x = -Math.PI / 2;
      sock.add(this.held);
    }
    this.heldKey = key;
  }

  dispose() {
    this.animator.dispose();
    this.scene.remove(this.rig.root);
  }
}
