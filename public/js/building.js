// Fortnite-style building: grid-snapped walls, floors, ramps and cones in
// wood, brick or metal. Pieces start weak and gain health while they build,
// can be edited on a tile grid, and collapse when they lose support.
import * as THREE from 'three';
import { TILE, LEVEL_H, MATERIALS, BUILD_COST } from './config.js';
import { makeBox, makeSlope } from './collision.js';
import { getTextures } from './textures.js';
import { terrainHeight } from './terrain.js';

const T = TILE, H = LEVEL_H;
const WALL_T = 0.3, FLOOR_T = 0.25;
const CONE_RISE = H * 0.45;
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // +x, -x, +z, -z
const DIR_ROT = [Math.PI / 2, -Math.PI / 2, 0, Math.PI];

export const GRID = { wall: [3, 3], floor: [2, 2], ramp: [2, 2], cone: [2, 2] };

let pieceId = 1;

function keyOf(p) {
  const y = Math.round(p.baseY * 10);
  if (p.type === 'wall') return `W${p.axis}:${p.gx},${p.gz},${y}`;
  return `${p.type[0].toUpperCase()}:${p.gx},${p.gz},${y}`;
}

export function pieceAABB(p) {
  const x0 = p.gx * T, z0 = p.gz * T;
  if (p.type === 'wall') {
    if (p.axis === 'x') return { min: [x0, p.baseY, z0 - WALL_T / 2], max: [x0 + T, p.baseY + H, z0 + WALL_T / 2] };
    return { min: [x0 - WALL_T / 2, p.baseY, z0], max: [x0 + WALL_T / 2, p.baseY + H, z0 + T] };
  }
  if (p.type === 'floor') return { min: [x0, p.baseY - FLOOR_T, z0], max: [x0 + T, p.baseY, z0 + T] };
  if (p.type === 'ramp') return { min: [x0, p.baseY, z0], max: [x0 + T, p.baseY + H, z0 + T] };
  return { min: [x0, p.baseY, z0], max: [x0 + T, p.baseY + CONE_RISE, z0 + T] };
}

function rampHeightFn(p) {
  const x0 = p.gx * T, z0 = p.gz * T, x1 = x0 + T, z1 = z0 + T;
  return (x, z) => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return null;
    let t;
    switch (p.dir) {
      case 0: t = (x - x0) / T; break;
      case 1: t = (x1 - x) / T; break;
      case 2: t = (z - z0) / T; break;
      default: t = (z1 - z) / T;
    }
    return p.baseY + H * t;
  };
}

// Cone corners: 0=(x0,z0) 1=(x1,z0) 2=(x1,z1) 3=(x0,z1). Raised corners come
// from edits and reshape the roof the way Fortnite cone edits do.
function coneHeights(p) {
  const up = p.edits || new Set();
  return [0, 1, 2, 3].map((i) => p.baseY + (up.has(i) ? CONE_RISE : 0));
}

function coneHeightFn(p) {
  const x0 = p.gx * T, z0 = p.gz * T, x1 = x0 + T, z1 = z0 + T;
  const cx = x0 + T / 2, cz = z0 + T / 2, top = p.baseY + CONE_RISE;
  return (x, z) => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return null;
    const c = coneHeights(p);
    const u = (x - cx) / (T / 2), v = (z - cz) / (T / 2);
    // Pick the triangle (centre + one edge) the point is in.
    let a, b, s;
    if (Math.abs(u) >= Math.abs(v)) {
      if (u >= 0) { a = c[1]; b = c[2]; s = (v + 1) / 2; } else { a = c[0]; b = c[3]; s = (v + 1) / 2; }
      const k = Math.abs(u);
      return top + ((a + (b - a) * s) - top) * k;
    }
    if (v >= 0) { a = c[3]; b = c[2]; s = (u + 1) / 2; } else { a = c[0]; b = c[1]; s = (u + 1) / 2; }
    const k = Math.abs(v);
    return top + ((a + (b - a) * s) - top) * k;
  };
}

function tileUV(g, cols, rows, c, r) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (c + uv.getX(i)) / cols, (r + uv.getY(i)) / rows);
  }
}

// Returns { meshes:[geometry...], colliders:[...] } for a piece.
function pieceShapes(p, withColliders) {
  const x0 = p.gx * T, z0 = p.gz * T;
  const geos = [];
  const cols = [];
  const edits = p.edits || new Set();

  if (p.type === 'wall') {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (edits.has(r * 3 + c)) continue;
        const u0 = (c * T) / 3, v0 = (r * H) / 3;
        let g;
        if (p.axis === 'x') {
          g = new THREE.BoxGeometry(T / 3, H / 3, WALL_T);
          g.translate(x0 + u0 + T / 6, p.baseY + v0 + H / 6, z0);
          if (withColliders) cols.push([x0 + u0, p.baseY + v0, z0 - WALL_T / 2, x0 + u0 + T / 3, p.baseY + v0 + H / 3, z0 + WALL_T / 2]);
        } else {
          g = new THREE.BoxGeometry(WALL_T, H / 3, T / 3);
          g.translate(x0, p.baseY + v0 + H / 6, z0 + u0 + T / 6);
          if (withColliders) cols.push([x0 - WALL_T / 2, p.baseY + v0, z0 + u0, x0 + WALL_T / 2, p.baseY + v0 + H / 3, z0 + u0 + T / 3]);
        }
        tileUV(g, 3, 3, c, r);
        geos.push(g);
      }
    }
  } else if (p.type === 'floor') {
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        if (edits.has(r * 2 + c)) continue;
        const g = new THREE.BoxGeometry(T / 2, FLOOR_T, T / 2);
        g.translate(x0 + c * (T / 2) + T / 4, p.baseY - FLOOR_T / 2, z0 + r * (T / 2) + T / 4);
        tileUV(g, 2, 2, c, r);
        geos.push(g);
        if (withColliders) cols.push([x0 + c * (T / 2), p.baseY - FLOOR_T, z0 + r * (T / 2), x0 + (c + 1) * (T / 2), p.baseY, z0 + (r + 1) * (T / 2)]);
      }
    }
  } else if (p.type === 'ramp') {
    const len = Math.hypot(T, H);
    const g = new THREE.BoxGeometry(T, FLOOR_T, len);
    g.rotateX(-Math.atan2(H, T));
    g.rotateY(DIR_ROT[p.dir]);
    g.translate(x0 + T / 2, p.baseY + H / 2 - FLOOR_T / 2, z0 + T / 2);
    geos.push(g);
  } else {
    const c = coneHeights(p);
    const top = p.baseY + CONE_RISE;
    const v = [[x0, c[0], z0], [x0 + T, c[1], z0], [x0 + T, c[2], z0 + T], [x0, c[3], z0 + T], [x0 + T / 2, top, z0 + T / 2]];
    const tris = [[0, 4, 1], [1, 4, 2], [2, 4, 3], [3, 4, 0]];
    const pos = [], uv = [];
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]];
    for (const t of tris) for (const i of t) { pos.push(...v[i]); uv.push(...uvs[i]); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    geos.push(g);
  }
  return { geos, cols };
}

export class BuildSystem {
  constructor(scene, collision) {
    this.scene = scene;
    this.col = collision;
    this.pieces = new Map();
    this.list = [];
    this.pending = [];
    this.time = 0;
    this.onDestroyed = null;
    const tex = getTextures();
    this.mats = {};
    this.buildingMats = {};
    for (const m of ['wood', 'brick', 'metal']) {
      this.mats[m] = new THREE.MeshLambertMaterial({ map: tex[m], side: THREE.DoubleSide });
      this.buildingMats[m] = new THREE.MeshLambertMaterial({ map: tex[m], side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
    }
    this.blueprint = new THREE.MeshBasicMaterial({ map: tex.blueprint, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.blueprintBad = new THREE.MeshBasicMaterial({ color: '#ff4a4a', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    this.preview = new THREE.Group();
    this.preview.visible = false;
    scene.add(this.preview);
    this.previewKey = '';

    // Edit overlay
    this.editGroup = new THREE.Group();
    this.editGroup.visible = false;
    scene.add(this.editGroup);
    this.tileMat = new THREE.MeshBasicMaterial({ color: '#7fd0ff', transparent: true, opacity: 0.35, depthTest: false, side: THREE.DoubleSide });
    this.tileSelMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthTest: false, side: THREE.DoubleSide });
  }

  // ------------------------------------------------------------ targeting

  // Which vertical grid offset to use: snap to a nearby structure if there is
  // one, otherwise start a new structure level with the builder's feet.
  yOffsetFor(pos) {
    let best = null, bd = Infinity;
    for (const p of this.list) {
      const cx = p.gx * T + T / 2, cz = p.gz * T + T / 2;
      const d = Math.hypot(cx - pos.x, cz - pos.z);
      if (d < T * 2.2 && Math.abs(p.baseY - pos.y) < H * 2.5 && d < bd) { bd = d; best = p; }
    }
    if (best) return ((best.baseY % H) + H) % H;
    return ((pos.y % H) + H) % H;
  }

  // Work out where a piece of `type` would go for a builder at pos (feet)
  // looking along yaw/pitch. Mirrors Fortnite's "build in front of you".
  computeTarget(type, pos, yaw, pitch) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const o = this.yOffsetFor(pos);
    let cx = Math.floor(pos.x / T), cz = Math.floor(pos.z / T);
    let lv = Math.round((pos.y - o) / H);
    const along = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 1) : (fz > 0 ? 2 : 3);
    const [dx, dz] = DIRS[along];

    // Standing on one of our ramps? Act as if we're at its top so ramp rushes
    // chain upward instead of stacking at the same height.
    // Check the level we're in and the one below (we may be at the very top).
    let lvR = Math.floor((pos.y - o + 0.05) / H);
    let ramp = this.pieces.get(`R:${cx},${cz},${Math.round((o + lvR * H) * 10)}`);
    if (!ramp) {
      const below = this.pieces.get(`R:${cx},${cz},${Math.round((o + (lvR - 1) * H) * 10)}`);
      if (below && pos.y - below.baseY <= H + 0.3) { ramp = below; lvR -= 1; }
    }
    let virtual = false;
    if (ramp && ramp.dir === along) {
      cx += dx; cz += dz; lv = lvR + 1; virtual = true;
    } else if (ramp) {
      lv = lvR + (pos.y - (o + lvR * H) > H * 0.5 ? 1 : 0);
    }

    const base = (l) => o + l * H;
    const lookDown = pitch < -0.55, lookUp = pitch > 0.6;
    const p = { type, mat: 'wood' };

    if (type === 'wall') {
      p.gx = cx; p.gz = cz;
      if (along === 0) { p.axis = 'z'; p.gx = cx + 1; }
      else if (along === 1) { p.axis = 'z'; }
      else if (along === 2) { p.axis = 'x'; p.gz = cz + 1; }
      else { p.axis = 'x'; }
      p.baseY = base(lookUp ? lv + 1 : lv);
    } else if (type === 'floor') {
      if (lookDown || virtual) { p.gx = cx; p.gz = cz; p.baseY = base(lv); }
      else if (lookUp) { p.gx = cx; p.gz = cz; p.baseY = base(lv + 1); }
      else { p.gx = cx + dx; p.gz = cz + dz; p.baseY = base(lv); }
    } else if (type === 'ramp') {
      p.dir = along;
      if (lookDown || virtual) { p.gx = cx; p.gz = cz; }
      else { p.gx = cx + dx; p.gz = cz + dz; }
      p.baseY = base(lv);
    } else {
      if (pitch > -0.1) { p.gx = cx; p.gz = cz; p.baseY = base(lv + 1); }
      else { p.gx = cx + dx; p.gz = cz + dz; p.baseY = base(lv); }
    }
    p.key = keyOf(p);
    return p;
  }

  canPlace(target) {
    if (this.pieces.has(target.key)) return false;
    return this.isGrounded(target) || this.neighbours(target).length > 0;
  }

  // ------------------------------------------------------------ placement

  place(target, mat, owner) {
    if (!this.canPlace(target)) return null;
    const isWall = target.type === 'wall';
    const spec = MATERIALS[mat];
    const [start, max] = isWall ? spec.wall : spec.other;
    const p = {
      id: pieceId++, type: target.type, gx: target.gx, gz: target.gz, baseY: target.baseY,
      axis: target.axis, dir: target.dir, mat, owner, key: target.key,
      hp: start, maxHp: max, rate: (max - start) / spec.time, built: false, edits: new Set(),
      group: new THREE.Group(), colliders: [],
    };
    this.pieces.set(p.key, p);
    this.list.push(p);
    this.scene.add(p.group);
    this.rebuild(p);
    return p;
  }

  rebuild(p) {
    for (const c of p.colliders) this.col.remove(c);
    p.colliders = [];
    p.group.clear();
    const { geos, cols } = pieceShapes(p, true);
    const mat = p.dmgMat || (p.built ? this.mats[p.mat] : this.buildingMats[p.mat]);
    for (const g of geos) {
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      p.group.add(m);
    }
    for (const c of cols) p.colliders.push(this.col.add(makeBox(...c, 'build', p)));
    const bb = pieceAABB(p);
    if (p.type === 'ramp') {
      p.colliders.push(this.col.add(makeSlope(bb.min[0], bb.min[1], bb.min[2], bb.max[0], bb.max[1], bb.max[2], rampHeightFn(p), 'build', p)));
    } else if (p.type === 'cone') {
      p.colliders.push(this.col.add(makeSlope(bb.min[0], bb.min[1], bb.min[2], bb.max[0], bb.min[1] + CONE_RISE, bb.max[2], coneHeightFn(p), 'build', p)));
    }
  }

  setPreview(target, valid) {
    if (!target) { this.preview.visible = false; return; }
    const key = target.key + (target.dir ?? '') + valid;
    if (key !== this.previewKey) {
      this.previewKey = key;
      this.preview.clear();
      const { geos } = pieceShapes({ ...target, edits: new Set() }, false);
      for (const g of geos) this.preview.add(new THREE.Mesh(g, valid ? this.blueprint : this.blueprintBad));
    }
    this.preview.visible = true;
  }

  // ------------------------------------------------------------ damage & support

  damage(p, amount, from = null) {
    if (!this.pieces.has(p.key) || p.collapsing) return false;
    p.hp -= amount;
    p.shakeT = 0.18;
    if (p.hp <= 0) {
      this.destroy(p, 'smash');
      this.collapseUnsupported(p);
      return true;
    }
    // Darken as it weakens so you can see a wall is about to go.
    if (!p.dmgMat) {
      p.dmgMat = (p.built ? this.mats : this.buildingMats)[p.mat].clone();
      for (const m of p.group.children) m.material = p.dmgMat;
    }
    p.dmgMat.color.setScalar(0.45 + 0.55 * Math.max(0, p.hp / p.maxHp));
    return false;
  }

  destroy(p, mode = 'smash') {
    if (!this.pieces.has(p.key)) return;
    this.pieces.delete(p.key);
    this.list.splice(this.list.indexOf(p), 1);
    for (const c of p.colliders) this.col.remove(c);
    this.scene.remove(p.group);
    p.dead = true;
    if (this.onDestroyed) this.onDestroyed(p, mode);
  }

  isGrounded(p) {
    const bb = pieceAABB(p);
    const pts = [
      [bb.min[0] + 0.2, bb.min[2] + 0.2], [bb.max[0] - 0.2, bb.min[2] + 0.2],
      [bb.min[0] + 0.2, bb.max[2] - 0.2], [bb.max[0] - 0.2, bb.max[2] - 0.2],
      [(bb.min[0] + bb.max[0]) / 2, (bb.min[2] + bb.max[2]) / 2],
    ];
    for (const [x, z] of pts) if (terrainHeight(x, z) >= bb.min[1] - 0.35) return true;
    const near = this.col.query(bb.min[0] - 0.1, bb.min[2] - 0.1, bb.max[0] + 0.1, bb.max[2] + 0.1);
    for (const c of near) {
      if (c.kind !== 'static') continue;
      if (c.max.y >= bb.min[1] - 0.3 && c.min.y <= bb.max[1] + 0.1) return true;
    }
    return false;
  }

  neighbours(p) {
    const a = pieceAABB(p);
    const e = 0.06;
    const out = [];
    for (const q of this.list) {
      if (q === p) continue;
      const b = pieceAABB(q);
      if (a.min[0] - e > b.max[0] || a.max[0] + e < b.min[0]) continue;
      if (a.min[1] - e > b.max[1] || a.max[1] + e < b.min[1]) continue;
      if (a.min[2] - e > b.max[2] || a.max[2] + e < b.min[2]) continue;
      out.push(q);
    }
    return out;
  }

  // Anything not connected to the ground through other builds falls down.
  // Anything not connected to the ground through other builds falls down,
  // crumbling outward from the piece that broke.
  collapseUnsupported(origin = null) {
    const supported = new Set();
    const queue = [];
    for (const p of this.list) if (!p.collapsing && this.isGrounded(p)) { supported.add(p); queue.push(p); }
    while (queue.length) {
      const p = queue.pop();
      for (const q of this.neighbours(p)) {
        if (!q.collapsing && !supported.has(q)) { supported.add(q); queue.push(q); }
      }
    }
    const doomed = this.list.filter((p) => !supported.has(p) && !p.collapsing);
    const ox = origin ? origin.gx * T + T / 2 : 0, oz = origin ? origin.gz * T + T / 2 : 0, oy = origin ? origin.baseY : 0;
    for (const p of doomed) {
      p.collapsing = true;
      const d = origin ? Math.hypot(p.gx * T + T / 2 - ox, p.baseY - oy, p.gz * T + T / 2 - oz) : 0;
      this.pending.push({ p, at: this.time + 0.2 + Math.min(1.5, d * 0.07) + Math.random() * 0.08 });
      if (!p.dmgMat) {
        p.dmgMat = (p.built ? this.mats : this.buildingMats)[p.mat].clone();
        for (const m of p.group.children) m.material = p.dmgMat;
      }
      p.dmgMat.color.setScalar(0.55);
      p.shakeT = 2;
    }
  }

  update(dt) {
    this.time += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].at > this.time) continue;
      const { p } = this.pending[i];
      this.pending.splice(i, 1);
      this.destroy(p, 'fall');
    }
    for (const p of this.list) {
      if (!p.built && !p.collapsing) {
        p.hp = Math.min(p.maxHp, p.hp + p.rate * dt);
        p.buildT = (p.buildT || 0) + dt;
        if (p.hp >= p.maxHp || p.buildT > MATERIALS[p.mat].time) {
          p.built = true;
          if (p.dmgMat) { p.dmgMat.transparent = false; p.dmgMat.opacity = 1; p.dmgMat.needsUpdate = true; }
          else for (const m of p.group.children) m.material = this.mats[p.mat];
        }
      }
      if (p.shakeT > 0) {
        p.shakeT -= dt;
        const a = p.collapsing ? 0.05 : Math.max(0, p.shakeT) * 0.4;
        p.group.position.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a * 0.5, (Math.random() - 0.5) * a);
        if (p.shakeT <= 0) p.group.position.set(0, 0, 0);
      }
    }
  }

  // ------------------------------------------------------------ editing

  // Tile under the crosshair for an edit, or -1.
  tileAt(p, o, d) {
    const x0 = p.gx * T, z0 = p.gz * T;
    const [cols, rows] = GRID[p.type];
    let u, v;
    if (p.type === 'wall') {
      if (p.axis === 'x') {
        if (Math.abs(d.z) < 1e-6) return -1;
        const t = (z0 - o.z) / d.z;
        if (t < 0) return -1;
        u = (o.x + d.x * t - x0) / T; v = (o.y + d.y * t - p.baseY) / H;
      } else {
        if (Math.abs(d.x) < 1e-6) return -1;
        const t = (x0 - o.x) / d.x;
        if (t < 0) return -1;
        u = (o.z + d.z * t - z0) / T; v = (o.y + d.y * t - p.baseY) / H;
      }
    } else {
      const planeY = p.type === 'floor' ? p.baseY : p.baseY + (p.type === 'ramp' ? H / 2 : CONE_RISE / 2);
      if (Math.abs(d.y) < 1e-6) return -1;
      const t = (planeY - o.y) / d.y;
      if (t < 0) return -1;
      u = (o.x + d.x * t - x0) / T; v = (o.z + d.z * t - z0) / T;
    }
    if (u < -0.02 || u > 1.02 || v < -0.02 || v > 1.02) return -1;
    const c = Math.min(cols - 1, Math.max(0, Math.floor(u * cols)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor(v * rows)));
    return r * cols + c;
  }

  startEdit(p) {
    this.editing = { piece: p, selected: [] };
    // Existing edits start selected, like Fortnite.
    if (p.type !== 'ramp') this.editing.selected = [...p.edits];
    this.drawEditOverlay();
  }

  toggleTile(i, dragging) {
    const e = this.editing;
    if (!e || i < 0) return;
    const idx = e.selected.indexOf(i);
    if (dragging) {
      if (idx < 0) e.selected.push(i);
    } else if (idx >= 0) e.selected.splice(idx, 1);
    else e.selected.push(i);
    this.drawEditOverlay();
  }

  confirmEdit(reset = false) {
    const e = this.editing;
    this.editing = null;
    this.editGroup.visible = false;
    if (!e || e.piece.dead) return;
    const p = e.piece;
    const [cols, rows] = GRID[p.type];
    if (reset) {
      p.edits = new Set();
    } else if (p.type === 'ramp') {
      if (e.selected.length >= 2) {
        const a = e.selected[0], b = e.selected[e.selected.length - 1];
        const du = (b % cols) - (a % cols), dv = Math.floor(b / cols) - Math.floor(a / cols);
        if (Math.abs(du) >= Math.abs(dv) && du !== 0) p.dir = du > 0 ? 0 : 1;
        else if (dv !== 0) p.dir = dv > 0 ? 2 : 3;
      }
    } else {
      if (e.selected.length >= cols * rows) return; // can't delete the whole piece
      p.edits = new Set(e.selected);
    }
    this.rebuild(p);
  }

  drawEditOverlay() {
    const e = this.editing;
    this.editGroup.clear();
    if (!e) return;
    const p = e.piece;
    const x0 = p.gx * T, z0 = p.gz * T;
    const [cols, rows] = GRID[p.type];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const sel = e.selected.includes(i);
        const pad = 0.08;
        let g;
        if (p.type === 'wall') {
          g = new THREE.PlaneGeometry(T / cols - pad, H / rows - pad);
          if (p.axis === 'z') g.rotateY(Math.PI / 2);
          const u = ((c + 0.5) * T) / cols, v = ((r + 0.5) * H) / rows;
          if (p.axis === 'x') g.translate(x0 + u, p.baseY + v, z0);
          else g.translate(x0, p.baseY + v, z0 + u);
        } else {
          g = new THREE.PlaneGeometry(T / cols - pad, T / rows - pad);
          g.rotateX(-Math.PI / 2);
          const y = p.type === 'floor' ? p.baseY + 0.05 : p.baseY + (p.type === 'ramp' ? H / 2 : CONE_RISE / 2);
          g.translate(x0 + ((c + 0.5) * T) / cols, y, z0 + ((r + 0.5) * T) / rows);
        }
        const m = new THREE.Mesh(g, sel ? this.tileSelMat : this.tileMat);
        m.renderOrder = 20;
        this.editGroup.add(m);
      }
    }
    this.editGroup.visible = true;
  }

  canAfford(mats, mat) {
    return mats[mat] >= BUILD_COST;
  }

  clearAll() {
    for (const p of [...this.list]) this.destroy(p);
  }
}
