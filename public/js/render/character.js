// Held items (guns, pickaxe, glider) and FighterView: the bridge from a sim
// Fighter to a skinned, animated character. The sim knows nothing about meshes.
import * as THREE from 'three';
import { RARITIES } from '/shared/config.js';
import { buildRig } from './rig.js';
import { Animator } from './animator.js';

const box = (w, h, d, color) => new THREE.Mesh(
  new THREE.BoxGeometry(w, h, d),
  new THREE.MeshLambertMaterial({ color }),
);

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
  const handle = box(0.08, 0.08, 1.15, '#8d5a3b');
  handle.position.z = -0.4;
  const wrap = box(0.1, 0.1, 0.22, '#2c3e50');
  wrap.position.z = -0.05;
  const collar = box(0.14, 0.16, 0.16, '#5d6d7e');
  collar.position.z = -0.95;
  // Curved head: two angled blades meeting at the collar.
  const bladeA = box(0.07, 0.42, 0.12, '#9ad0ec');
  bladeA.position.set(0, 0.22, -0.92);
  bladeA.rotation.x = 0.35;
  const bladeB = box(0.07, 0.42, 0.12, '#9ad0ec');
  bladeB.position.set(0, -0.22, -0.92);
  bladeB.rotation.x = -0.35;
  const tipA = box(0.05, 0.12, 0.08, '#e9f7ff');
  tipA.position.set(0, 0.45, -0.85);
  tipA.rotation.x = 0.6;
  const tipB = box(0.05, 0.12, 0.08, '#e9f7ff');
  tipB.position.set(0, -0.45, -0.85);
  tipB.rotation.x = -0.6;
  g.add(handle, wrap, collar, bladeA, bladeB, tipA, tipB);
  g.scale.setScalar(1.15);
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


// Distance bands: full detail and foot IK, reduced animation rate, then a stand-in.
const LOD_NEAR = 40;
const LOD_FAR = 150;

export class FighterView {
  constructor(scene, fighter, { groundAt = null } = {}) {
    this.scene = scene;
    this.f = fighter;
    this.rig = buildRig(fighter.outfit);
    this.animator = new Animator(this.rig, groundAt);
    scene.add(this.rig.root);
    this.glider = gliderMesh(this.rig.outfit.pack);
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
    this.pending = 0;
  }

  syncHeld() {
    const f = this.f;
    const w = f.weapon;
    let key = w ? `${w.type}:${w.rarity}` : (f.selected === 0 ? 'pick' : (f.item ? 'item' : ''));
    if (f.airborne || f.state === 'bus' || f.emote > 0) key = '';
    if (key === this.heldKey) return;
    const sock = this.rig.sockets.right;
    if (this.held) sock.remove(this.held);
    this.held = null;
    if (key === 'pick') this.held = pickaxeMesh();
    else if (w && key) this.held = gunMesh(w.type, w.rarity);
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
