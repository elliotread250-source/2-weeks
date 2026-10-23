// Fortnite-style building rules: grid-snapped walls, floors, ramps and cones in
// wood, brick or metal. Pieces start weak and gain health while they build,
// can be edited on a tile grid, and collapse when they lose support. Pure
// simulation: the renderer listens for events and draws the pieces itself.
import { TILE, LEVEL_H, MATERIALS, BUILD_COST } from '../config.js';
import { makeBox, makeSlope } from './collision.js';
import { terrainHeight } from './terrain.js';

const T = TILE, H = LEVEL_H;
export const WALL_T = 0.3, FLOOR_T = 0.25;
export const CONE_RISE = H * 0.45;
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // +x, -x, +z, -z

export const GRID = { wall: [3, 3], floor: [2, 2], ramp: [2, 2], cone: [2, 2] };

export function keyOf(p) {
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
export function coneHeights(p) {
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

// Collider boxes for the solid tiles of a piece (ramps and cones add a slope
// collider on top, see BuildSystem.rebuild).
export function pieceBoxes(p) {
  const x0 = p.gx * T, z0 = p.gz * T;
  const cols = [];
  const edits = p.edits || new Set();
  if (p.type === 'wall') {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (edits.has(r * 3 + c)) continue;
        const u0 = (c * T) / 3, v0 = (r * H) / 3;
        if (p.axis === 'x') cols.push([x0 + u0, p.baseY + v0, z0 - WALL_T / 2, x0 + u0 + T / 3, p.baseY + v0 + H / 3, z0 + WALL_T / 2]);
        else cols.push([x0 - WALL_T / 2, p.baseY + v0, z0 + u0, x0 + WALL_T / 2, p.baseY + v0 + H / 3, z0 + u0 + T / 3]);
      }
    }
  } else if (p.type === 'floor') {
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        if (edits.has(r * 2 + c)) continue;
        cols.push([x0 + c * (T / 2), p.baseY - FLOOR_T, z0 + r * (T / 2), x0 + (c + 1) * (T / 2), p.baseY, z0 + (r + 1) * (T / 2)]);
      }
    }
  }
  return cols;
}

export class BuildSystem {
  // emit(type, data): 'buildPlaced', 'buildChanged', 'buildDamaged',
  // 'buildComplete', 'buildCollapsing', 'buildDestroyed'.
  constructor(collision, rng, emit = () => {}) {
    this.col = collision;
    this.rng = rng;
    this.emit = emit;
    this.pieces = new Map();
    this.list = [];
    this.pending = [];
    this.time = 0;
    this.nextId = 1;
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
      id: this.nextId++, type: target.type, gx: target.gx, gz: target.gz, baseY: target.baseY,
      axis: target.axis, dir: target.dir, mat, owner, key: target.key,
      hp: start, maxHp: max, rate: (max - start) / spec.time, built: false, edits: new Set(), colliders: [],
    };
    this.pieces.set(p.key, p);
    this.list.push(p);
    this.rebuild(p);
    if (owner && owner.stats) owner.stats.built++;
    this.emit('buildPlaced', { p });
    return p;
  }

  rebuild(p) {
    for (const c of p.colliders) this.col.remove(c);
    p.colliders = [];
    for (const c of pieceBoxes(p)) p.colliders.push(this.col.add(makeBox(...c, 'build', p)));
    const bb = pieceAABB(p);
    if (p.type === 'ramp') {
      p.colliders.push(this.col.add(makeSlope(bb.min[0], bb.min[1], bb.min[2], bb.max[0], bb.max[1], bb.max[2], rampHeightFn(p), 'build', p)));
    } else if (p.type === 'cone') {
      p.colliders.push(this.col.add(makeSlope(bb.min[0], bb.min[1], bb.min[2], bb.max[0], bb.min[1] + CONE_RISE, bb.max[2], coneHeightFn(p), 'build', p)));
    }
  }

  // ------------------------------------------------------------ damage & support

  damage(p, amount) {
    if (!this.pieces.has(p.key) || p.collapsing) return false;
    p.hp -= amount;
    if (p.hp <= 0) {
      this.destroy(p, 'smash');
      this.collapseUnsupported(p);
      return true;
    }
    this.emit('buildDamaged', { p });
    return false;
  }

  destroy(p, mode = 'smash') {
    if (!this.pieces.has(p.key)) return;
    this.pieces.delete(p.key);
    this.list.splice(this.list.indexOf(p), 1);
    for (const c of p.colliders) this.col.remove(c);
    p.dead = true;
    this.emit('buildDestroyed', { p, mode });
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
      this.pending.push({ p, at: this.time + 0.2 + Math.min(1.5, d * 0.07) + this.rng.random() * 0.08 });
      this.emit('buildCollapsing', { p });
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
          this.emit('buildComplete', { p });
        }
      }
    }
  }

  // ------------------------------------------------------------ editing
  // Edit state lives on the fighter (`f.editing = {piece, selected}`) so every
  // player can edit at once.

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

  startEdit(f, p) {
    f.editing = { piece: p, selected: [] };
    // Existing edits start selected, like Fortnite.
    if (p.type !== 'ramp') f.editing.selected = [...p.edits];
  }

  toggleTile(f, i, dragging) {
    const e = f.editing;
    if (!e || i < 0) return;
    const idx = e.selected.indexOf(i);
    if (dragging) {
      if (idx < 0) e.selected.push(i);
    } else if (idx >= 0) e.selected.splice(idx, 1);
    else e.selected.push(i);
  }

  confirmEdit(f, reset = false) {
    const e = f.editing;
    f.editing = null;
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
    this.emit('buildChanged', { p });
  }

  canAfford(mats, mat) {
    return mats[mat] >= BUILD_COST;
  }

  clearAll() {
    for (const p of [...this.list]) this.destroy(p);
  }
}
