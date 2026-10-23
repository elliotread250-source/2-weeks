// Meshes and materials for cosmetics other than outfits: harvesting tools,
// gliders, weapon wraps and contrails. Everything is built from primitives and
// canvases, so there is nothing to download.
import * as THREE from 'three';
import { item } from '/shared/cosmetics/catalog.js';

const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c));

// ---------------------------------------------------------------- pickaxes

// The tool is built pointing along -Z with the grip near the origin, like the
// original pickaxe, so it sits in the hand socket the same way.
export function pickaxeFromSpec(spec) {
  const g = new THREE.Group();
  const { head, handle, color, trim } = spec;
  const shaft = box(0.08, 0.08, 1.15, handle);
  shaft.position.z = -0.4;
  const wrap = box(0.1, 0.1, 0.22, '#2c3e50');
  wrap.position.z = -0.05;
  g.add(shaft, wrap);
  const at = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  const cyl = (r, h, c, seg = 8) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), lam(c));
  const cone = (r, h, c) => new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), lam(c));
  switch (head) {
    case 'axe':
      at(box(0.06, 0.34, 0.26, color), 0, 0.1, -0.88); at(box(0.05, 0.12, 0.12, trim), 0, 0.3, -0.88);
      break;
    case 'hammer':
      at(box(0.16, 0.18, 0.4, color), 0, 0, -0.95); at(box(0.18, 0.2, 0.06, trim), 0, 0, -1.15);
      break;
    case 'mallet':
      at(cyl(0.12, 0.36, color), 0, 0, -0.95, 0, 0, Math.PI / 2); at(cyl(0.125, 0.06, trim), 0.2, 0, -0.95, 0, 0, Math.PI / 2); at(cyl(0.125, 0.06, trim), -0.2, 0, -0.95, 0, 0, Math.PI / 2);
      break;
    case 'scythe':
      at(box(0.05, 0.08, 0.5, color), 0, 0.2, -1.0, 0.3); at(box(0.04, 0.06, 0.3, trim), 0, 0.42, -1.2, 0.8);
      break;
    case 'club':
      at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), lam(color)), 0, 0, -0.95);
      for (const [x, y] of [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) at(cone(0.05, 0.12, trim), x, y, -0.95, 0, 0, x ? (x > 0 ? -Math.PI / 2 : Math.PI / 2) : (y > 0 ? 0 : Math.PI));
      break;
    case 'wrench':
      at(box(0.28, 0.1, 0.14, color), 0, 0, -0.95); at(box(0.08, 0.1, 0.1, trim), 0.14, 0, -1.02); at(box(0.08, 0.1, 0.1, trim), -0.14, 0, -1.02);
      break;
    case 'candy':
      at(box(0.05, 0.4, 0.05, color), 0, 0.2, -0.88); at(box(0.05, 0.05, 0.3, color), 0, 0.4, -0.76); at(box(0.06, 0.08, 0.06, trim), 0, 0.2, -0.88);
      break;
    case 'trident':
      at(box(0.04, 0.04, 0.34, color), 0, 0, -1.05); at(box(0.04, 0.04, 0.3, color), 0.12, 0, -1.03); at(box(0.04, 0.04, 0.3, color), -0.12, 0, -1.03); at(box(0.3, 0.04, 0.05, trim), 0, 0, -0.9);
      break;
    case 'shovel':
      at(box(0.22, 0.04, 0.3, color), 0, 0, -1.05); at(box(0.2, 0.05, 0.06, trim), 0, 0, -0.9);
      break;
    case 'bone':
      at(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lam(color)), 0.07, 0.04, -0.98); at(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lam(color)), -0.07, 0.04, -0.98);
      at(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lam(trim)), 0.07, -0.05, -0.98);
      break;
    default: { // pick: two curved blades meeting at a collar
      at(box(0.14, 0.14, 0.16, '#5d6d7e'), 0, 0, -0.95);
      at(box(0.07, 0.42, 0.12, color), 0, 0.22, -0.92, 0.35); at(box(0.07, 0.42, 0.12, color), 0, -0.22, -0.92, -0.35);
      at(box(0.05, 0.12, 0.08, trim), 0, 0.45, -0.85, 0.6); at(box(0.05, 0.12, 0.08, trim), 0, -0.45, -0.85, -0.6);
    }
  }
  g.scale.setScalar(1.15);
  return g;
}

export function pickaxeMesh(id = 'pickaxe_default') {
  const it = item(id) || item('pickaxe_default');
  return pickaxeFromSpec(it.spec);
}

// ---------------------------------------------------------------- gliders

export function gliderFromSpec(spec) {
  const { shape, a, b } = spec;
  const g = new THREE.Group();
  const two = (c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide });
  const flat = (shapeFn, c, y = 2.9) => {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shapeFn), two(c));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    g.add(m);
    return m;
  };
  const poly = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; };
  const strut = (x, z = 0) => { const m = box(0.03, 1.3, 0.03, '#333'); m.position.set(x * 0.4, 2.25, z); m.rotation.z = x > 0 ? 0.4 : -0.4; g.add(m); };
  switch (shape) {
    case 'umbrella': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), two(a));
      dome.position.y = 2.7; g.add(dome);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 6, 20), lam(b)); rim.rotation.x = Math.PI / 2; rim.position.y = 2.7; g.add(rim);
      const pole = box(0.05, 1.5, 0.05, '#444'); pole.position.y = 2.1; g.add(pole);
      break;
    }
    case 'kite':
      flat(poly([[0, 1.5], [1.1, 0], [0, -1.1], [-1.1, 0]]), a); flat(poly([[0, 1.5], [0.12, 0], [0, -1.1], [-0.12, 0]]), b, 2.91); strut(1); strut(-1);
      break;
    case 'sail':
      flat(poly([[-1.6, -0.4], [0, 1.2], [1.6, -0.4], [0, -0.1]]), a); flat(poly([[-0.8, -0.2], [0, 0.6], [0.8, -0.2], [0, -0.05]]), b, 2.91); strut(1); strut(-1);
      break;
    case 'wings':
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.7), two(a));
        w.position.set(s * 0.85, 2.9, 0); w.rotation.z = s * 0.15; g.add(w);
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.5), two(b));
        tip.position.set(s * 1.75, 2.98, 0.05); tip.rotation.z = s * 0.3; g.add(tip);
      }
      break;
    case 'manta':
      flat(poly([[-1.9, 0.2], [-0.9, 0.7], [0, 0.4], [0.9, 0.7], [1.9, 0.2], [0, -1.0]]), a); flat(poly([[-0.5, 0.2], [0, 0.5], [0.5, 0.2], [0, -0.4]]), b, 2.91); strut(1); strut(-1);
      break;
    case 'rotor': {
      const hub = box(0.12, 0.2, 0.12, b); hub.position.y = 2.95; g.add(hub);
      const mast = box(0.05, 0.9, 0.05, '#444'); mast.position.y = 2.5; g.add(mast);
      for (const r of [0, Math.PI / 2]) { const bl = box(3.2, 0.03, 0.22, a); bl.position.y = 3.0; bl.rotation.y = r; g.add(bl); }
      g.userData.spin = hub;
      break;
    }
    case 'banner': {
      flat(poly([[-1.0, 0.9], [1.0, 0.9], [1.0, -0.9], [-1.0, -0.9]]), a); flat(poly([[-1.0, 0.3], [1.0, 0.3], [1.0, -0.3], [-1.0, -0.3]]), b, 2.91); strut(1); strut(-1);
      break;
    }
    default: // delta
      flat(poly([[-1.9, 0], [0, 0.8], [1.9, 0], [0, -0.5]]), a);
      { const stripe = box(0.15, 0.05, 1.3, b); stripe.position.set(0, 2.92, 0.1); g.add(stripe); }
      strut(1); strut(-1);
  }
  return g;
}

export function gliderMesh(id = 'glider_default') {
  const it = item(id) || item('glider_default');
  return gliderFromSpec(it.spec);
}

// ---------------------------------------------------------------- wraps

const wrapCache = new Map();

// A small repeating texture that is multiplied onto the gun body colour.
export function wrapMaterial(spec) {
  if (!spec) return null;
  const key = `${spec.kind}${spec.a}${spec.b}`;
  if (wrapCache.has(key)) return wrapCache.get(key);
  let mat;
  if (typeof document === 'undefined') {
    mat = lam(spec.a);
  } else {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = spec.a; g.fillRect(0, 0, S, S);
    g.fillStyle = spec.b;
    const rnd = ((seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; })(spec.a.length * 977 + spec.b.charCodeAt(2));
    switch (spec.kind) {
      case 'camo': for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(rnd() * S, rnd() * S, 6 + rnd() * 9, 4 + rnd() * 6, rnd() * 3, 0, Math.PI * 2); g.fill(); } break;
      case 'stripes': for (let i = 0; i < 4; i++) g.fillRect(0, i * 16 + 2, S, 7); break;
      case 'checker': for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) g.fillRect(x * 16, y * 16, 16, 16); break;
      case 'gradient': { const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, spec.a); gr.addColorStop(1, spec.b); g.fillStyle = gr; g.fillRect(0, 0, S, S); break; }
      case 'dots': for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.beginPath(); g.arc(x * 16 + 8, y * 16 + 8, 4, 0, Math.PI * 2); g.fill(); } break;
      case 'circuit': g.strokeStyle = spec.b; g.lineWidth = 2; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(rnd() * S, rnd() * S); g.lineTo(rnd() * S, rnd() * S); g.stroke(); g.fillRect(rnd() * S, rnd() * S, 4, 4); } break;
      case 'flames': for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(i * 8, S); g.quadraticCurveTo(i * 8 + 4, S - 20 - rnd() * 24, i * 8 + 8, S); g.fill(); } break;
      default: break;
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.MeshLambertMaterial({ map: tex });
    if (spec.kind === 'solid' && spec.b === '#7c4dff') mat.emissive = new THREE.Color('#1a0a3a');
  }
  wrapCache.set(key, mat);
  return mat;
}

// ---------------------------------------------------------------- contrails

// Pooled puffs shed behind skydiving and gliding fighters that equipped a trail.
export class ContrailSystem {
  constructor(scene, max = 400) {
    this.scene = scene;
    this.max = max;
    this.pool = [];
    this.live = [];
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mats = new Map();
    this.timers = new Map();
  }

  mat(color) {
    if (!this.mats.has(color)) this.mats.set(color, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    return this.mats.get(color);
  }

  emit(fighterId, pos, spec, dt) {
    let t = (this.timers.get(fighterId) || 0) - dt;
    if (t > 0) { this.timers.set(fighterId, t); return; }
    t = spec.pattern === 'ribbon' ? 0.03 : 0.045;
    this.timers.set(fighterId, t);
    if (this.live.length >= this.max) return;
    const m = this.pool.pop() || new THREE.Mesh(this.geo, this.mat(spec.a));
    const second = Math.random() < 0.5;
    m.material = this.mat(second ? spec.b : spec.a);
    m.position.set(pos.x + (Math.random() - 0.5) * 0.3, pos.y + 1.0 + (Math.random() - 0.5) * 0.3, pos.z + (Math.random() - 0.5) * 0.3);
    const base = { smoke: 0.7, bubbles: 0.35, hearts: 0.3, stars: 0.28, sparks: 0.14, ribbon: 0.4 }[spec.pattern] || 0.4;
    this.live.push({ m, life: 1.4, size: base, drift: spec.pattern === 'bubbles' ? 1.2 : spec.pattern === 'sparks' ? -0.5 : 0.2, spin: Math.random() * 4 });
    this.scene.add(m);
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      p.m.position.y += p.drift * dt;
      p.m.rotation.y += p.spin * dt;
      p.m.rotation.z += p.spin * dt * 0.5;
      p.m.scale.setScalar(p.size * Math.max(0.05, Math.min(1, p.life / 0.7)));
      if (p.life <= 0) { this.scene.remove(p.m); this.pool.push(p.m); this.live.splice(i, 1); }
    }
  }
}
