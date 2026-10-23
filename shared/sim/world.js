// The island as pure data: breakable static chunks, harvestable props, loot
// spots and colliders. No rendering. The server and every client run the same
// build from the same seed and get identical results, so none of this is ever
// sent over the network; the renderer reads `prims` and `harvestables` to draw it.
import { makeBox, makeSlope } from './collision.js';
import { terrainHeight, POIS, TERRAIN_SIZE, distToRoad } from './terrain.js';
import { addStaticDetail, addPalms } from './decor.js';
import { mulberry32 } from '../math/util.js';
import { Vec3, quatFromEuler, quatFromAxisAngle, quatRotateUp } from '../math/vec3.js';
import { MAP_SEED, DECOR_SEED } from '../config.js';
import { attachPois, bindPoiRandom } from './pois.js';

// Seeded generators for the build in progress. A build is synchronous, so
// module-level handles are safe; World.build() points them at its own streams.
let R = null;
let rr = null;

// Wall chunk sizes: every wall, floor, roof and stair is split into pieces that
// each own a collider and can be destroyed on their own.
const MAX_SPAN = 2.6;
const MAX_SLAB = 5;
const MAX_RISE = 4.5;

// Records primitives (for the renderer) and colliders (for the sim). A primitive
// is {k:'box'|'ramp'|'pyramid'|'cyl'|'sphere'|'cone', ...dims, color, jit, el}.
class StaticBuilder {
  constructor(collision) {
    this.col = collision;
    this.prims = [];
    this.elements = [];
    this.mat = 'brick'; // material that breaking the next pieces gives
  }

  element(mat, volume) {
    const base = { wood: 140, brick: 220, metal: 320 }[mat];
    const el = {
      id: this.elements.length, static: true, mat, colliders: [], dead: false, prims: [],
      hp: Math.round(base * Math.min(2.4, Math.max(0.45, volume / 6))),
    };
    el.maxHp = el.hp;
    this.elements.push(el);
    return el;
  }

  // jitter shades each chunk slightly so big walls don't look flat. The random
  // draw happens even when jitter is 0 so the stream stays in sync.
  push(prim, color, jitter = 0.04, owner = null) {
    prim.color = color;
    prim.jit = 1 + (R() - 0.5) * jitter;
    prim.el = owner ? owner.id : -1;
    if (owner) {
      owner.hex = color;
      owner.jit = prim.jit;
      owner.prims.push(this.prims.length);
    }
    this.prims.push(prim);
  }

  addCollider(el, c) {
    c.owner = el;
    el.colliders.push(this.col.add(c));
    if (!el.min) {
      el.min = { ...c.min };
      el.max = { ...c.max };
    } else {
      for (const a of ['x', 'y', 'z']) {
        el.min[a] = Math.min(el.min[a], c.min[a]);
        el.max[a] = Math.max(el.max[a], c.max[a]);
      }
    }
  }

  // Axis-aligned block, chopped into breakable chunks.
  box(x0, y0, z0, x1, y1, z1, color, collide = true, mat = this.mat) {
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01 || z1 - z0 < 0.01) return;
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    if (h < 0.06) {
      // Paint-thin decals (court lines) stay decorative.
      this.push({ k: 'box', x0, y0, z0, x1, y1, z1 }, color);
      return;
    }
    const slab = h < 0.6;
    const spanX = slab ? MAX_SLAB : (d < 1.2 ? MAX_SPAN : MAX_SLAB);
    const spanZ = slab ? MAX_SLAB : (w < 1.2 ? MAX_SPAN : MAX_SLAB);
    const nx = Math.max(1, Math.round(w / spanX));
    const nz = Math.max(1, Math.round(d / spanZ));
    const ny = Math.max(1, Math.round(h / MAX_RISE));
    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        for (let iz = 0; iz < nz; iz++) {
          const ax = x0 + (w * ix) / nx, bx = x0 + (w * (ix + 1)) / nx;
          const ay = y0 + (h * iy) / ny, by = y0 + (h * (iy + 1)) / ny;
          const az = z0 + (d * iz) / nz, bz = z0 + (d * (iz + 1)) / nz;
          const el = this.element(mat, (bx - ax) * (by - ay) * (bz - az) + (bx - ax) * (bz - az) * 0.4 + (bx - ax) * (by - ay) * 0.4 + (by - ay) * (bz - az) * 0.4);
          this.push({ k: 'box', x0: ax, y0: ay, z0: az, x1: bx, y1: by, z1: bz }, color, 0.04, el);
          this.addCollider(el, makeBox(ax, ay, az, bx, by, bz, 'static', el));
        }
      }
    }
  }

  // Stair ramp rising along +z from (zLow, y) to (zLow + run, y + rise).
  rampZ(x0, x1, zLow, run, y, rise, color) {
    const el = this.element('wood', 8);
    this.push({ k: 'ramp', x0, x1, zLow, run, y, rise }, color, 0.04, el);
    const hf = (x, z) => {
      if (x < x0 || x > x1 || z < zLow || z > zLow + run) return null;
      return y + (rise * (z - zLow)) / run;
    };
    this.addCollider(el, makeSlope(x0, y, zLow, x1, y + rise, zLow + run, hf, 'static', el));
  }

  // Four-sided pyramid roof with a matching walkable slope collider.
  pyramid(x0, z0, x1, z1, y, rise, color) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const el = this.element('wood', ((x1 - x0) * (z1 - z0)) / 6);
    this.push({ k: 'pyramid', x0, z0, x1, z1, y, rise }, color, 0, el);
    const hw = (x1 - x0) / 2, hd = (z1 - z0) / 2;
    const hf = (x, z) => {
      if (x < x0 || x > x1 || z < z0 || z > z1) return null;
      const k = Math.max(Math.abs(x - cx) / hw, Math.abs(z - cz) / hd);
      return y + rise * (1 - k);
    };
    this.addCollider(el, makeSlope(x0, y, z0, x1, y + rise, z1, hf, 'static', el));
  }

  // Cylinders (tanks, chimneys, poles) are stacked in breakable rings.
  cylinder(x, y, z, r, h, color, collide = true, seg = 10) {
    const n = Math.max(1, Math.round(h / MAX_RISE));
    for (let i = 0; i < n; i++) {
      const sh = h / n, sy = y + i * sh;
      const el = this.element('metal', Math.PI * r * r * sh * 0.5 + 1);
      this.push({ k: 'cyl', x, sy, z, r, sh, seg }, color, 0.04, el);
      const rr2 = Math.max(0.12, r * 0.85);
      this.addCollider(el, makeBox(x - rr2, sy, z - rr2, x + rr2, sy + sh, z + rr2, 'static', el));
    }
  }

  sphere(x, y, z, r, color) {
    const el = this.element('metal', r * r * 2);
    this.push({ k: 'sphere', x, y, z, r }, color, 0.04, el);
    this.addCollider(el, makeBox(x - r * 0.8, y - r * 0.8, z - r * 0.8, x + r * 0.8, y + r * 0.8, z + r * 0.8, 'static', el));
  }

  // Decorative cone (beach umbrellas): no collider, never breaks.
  cone(x, y, z, r, h, seg, color) {
    this.push({ k: 'cone', x, y, z, r, h, seg }, color);
  }
}

const noop = () => {};

export class World {
  // emit(type, data) receives 'staticDamaged', 'staticBroken', 'harvestHit' and
  // 'harvestBroken' so the renderer can react without the sim knowing about it.
  constructor(collision, opts = {}) {
    this.col = collision;
    this.seed = opts.seed ?? MAP_SEED;
    this.decorSeed = opts.decorSeed ?? DECOR_SEED;
    this.emit = opts.emit || noop;
    this.sb = new StaticBuilder(collision);
    this.lootSpots = [];
    this.harvestables = [];
    this.signs = [];
    this.pending = [];
    this.time = 0;
    this.buildings = [];
    this.brokenThisTick = 0;
  }

  get prims() { return this.sb.prims; }
  get elements() { return this.sb.elements; }

  build() {
    this.R = mulberry32(this.seed);
    this.R2 = mulberry32(this.decorSeed);
    R = this.R;
    rr = (a, b) => a + R() * (b - a);
    bindPoiRandom(R);

    this.buildPrison();
    this.buildControl();
    this.buildBio();
    this.buildChem();
    this.buildFactory();
    this.buildHarbor();
    this.buildLiving();
    this.buildHQ();
    this.buildDecon();
    this.buildShore();
    this.buildSecurity();
    this.buildConstruction();
    this.buildLighthouse();
    addStaticDetail(this);
    addPalms(this);
    this.scatterNature();
    this.scatterWildLoot();
    R = null;
    rr = null;
    return this;
  }

  // ---------------------------------------------------------------- helpers

  ground(x, z) {
    return terrainHeight(x, z);
  }


  // A multi-storey building with doors, windows, internal stair ramps,
  // floor slabs and (optionally) a walkable roof.
  building(o) {
    const sb = this.sb;
    const {
      x, z, w, d, floors = 1, fh = 4, color = '#d8d0c0', trim = '#8b8172',
      floorColor = '#a99a86', roofColor = '#6d6a66', doors = ['s'], windows = true,
      roofAccess = true, parapet = true, pitched = null, walls = true, poi = null,
    } = o;
    const base = o.base ?? this.ground(x, z);
    const t = 0.4;
    const y0 = base + 0.2;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const sw = 2.4;
    const run = fh * 1.55;
    const zLow = z0 + t + 1.0;

    sb.box(x0 - 0.3, base - 5, z0 - 0.3, x1 + 0.3, y0, z1 + 0.3, trim);

    const stairX = (L) => (L % 2 === 1 ? x0 + t : x1 - t - sw);
    const hasStairs = (L) => L < floors || (L === floors && roofAccess && !pitched);

    for (let L = 0; L < floors; L++) {
      const yb = y0 + L * fh;
      if (walls) {
        const sides = [
          { side: 'n', axis: 'x', a0: x0, a1: x1, c0: z0, c1: z0 + t },
          { side: 's', axis: 'x', a0: x0, a1: x1, c0: z1 - t, c1: z1 },
          { side: 'w', axis: 'z', a0: z0 + t, a1: z1 - t, c0: x0, c1: x0 + t },
          { side: 'e', axis: 'z', a0: z0 + t, a1: z1 - t, c0: x1 - t, c1: x1 },
        ];
        for (const s of sides) {
          const ops = [];
          const len = s.a1 - s.a0;
          const mid = (s.a0 + s.a1) / 2;
          if (L === 0 && doors.includes(s.side)) ops.push({ c: mid, w: 2.4, y0: 0, y1: 3.0 });
          if (windows) {
            const n = Math.floor(len / 5.5);
            for (let i = 0; i < n; i++) {
              const c = s.a0 + ((i + 0.5) * len) / n;
              if (ops.some((op) => Math.abs(op.c - c) < 2.6)) continue;
              if (Math.abs(c - s.a0) < 1.4 || Math.abs(c - s.a1) < 1.4) continue;
              ops.push({ c, w: 1.6, y0: 1.2, y1: 2.6 });
            }
          }
          this.wallWithOpenings(s.axis, s.a0, s.a1, s.c0, s.c1, yb, fh, ops, L === 0 ? color : (o.upperColor || color), trim);
        }
        // Skirting along the base of the ground floor.
        if (L === 0) {
          const k = 0.08, hh = 0.5;
          // Only on sides without a door, so nothing trips you at the entrance.
          if (!doors.includes('n')) sb.box(x0 - k, yb, z0 - k, x1 + k, yb + hh, z0 + 0.05, trim);
          if (!doors.includes('s')) sb.box(x0 - k, yb, z1 - 0.05, x1 + k, yb + hh, z1 + k, trim);
          if (!doors.includes('w')) sb.box(x0 - k, yb, z0 + 0.05, x0 + 0.05, yb + hh, z1 - 0.05, trim);
          if (!doors.includes('e')) sb.box(x1 - 0.05, yb, z0 + 0.05, x1 + k, yb + hh, z1 - 0.05, trim);
        }
        // Trim band between floors.
        sb.box(x0 - 0.15, yb + fh - 0.35, z0 - 0.15, x1 + 0.15, yb + fh, z1 + 0.15, trim, false);
      } else {
        // Open frame (construction site): columns only.
        const cols = [];
        for (let cx = x0; cx <= x1 + 0.01; cx += w / Math.max(1, Math.round(w / 6))) {
          for (let cz = z0; cz <= z1 + 0.01; cz += d / Math.max(1, Math.round(d / 6))) cols.push([cx, cz]);
        }
        for (const [cx, cz] of cols) {
          const xx = Math.min(Math.max(cx, x0 + 0.3), x1 - 0.3), zz = Math.min(Math.max(cz, z0 + 0.3), z1 - 0.3);
          sb.box(xx - 0.3, yb, zz - 0.3, xx + 0.3, yb + fh, zz + 0.3, trim);
        }
      }

      // Ramp from this floor up to the next one.
      if (hasStairs(L + 1)) {
        const sx = stairX(L + 1);
        sb.rampZ(sx, sx + sw, zLow, run, yb, fh, '#8f7f6a');
      }

      // Loot spots on this floor (away from the stair columns).
      const lootCount = Math.max(1, Math.round((w * d) / 120));
      for (let i = 0; i < lootCount; i++) {
        const lx = rr(x0 + sw + 1.6, x1 - sw - 1.6);
        const lz = rr(z0 + 1.5, z1 - 1.5);
        this.lootSpots.push({ x: lx, y: yb, z: lz, type: R() < 0.32 ? 'chest' : (R() < 0.25 ? 'ammo' : 'floor'), poi });
      }
    }

    // Slabs for every upper floor and the roof, with a hole above the ramp.
    for (let L = 1; L <= floors; L++) {
      const top = y0 + L * fh;
      const isRoof = L === floors;
      const colr = isRoof ? roofColor : floorColor;
      if (hasStairs(L)) {
        const hx0 = stairX(L), hx1 = hx0 + sw;
        const hz0 = zLow, hz1 = zLow + run;
        sb.box(x0, top - 0.3, z0, hx0, top, z1, colr);
        sb.box(hx1, top - 0.3, z0, x1, top, z1, colr);
        sb.box(hx0, top - 0.3, z0, hx1, top, hz0, colr);
        sb.box(hx0, top - 0.3, hz1, hx1, top, z1, colr);
      } else {
        sb.box(x0, top - 0.3, z0, x1, top, z1, colr);
      }
      if (isRoof && parapet && !pitched) {
        const ph = 1.0;
        sb.box(x0, top, z0, x1, top + ph, z0 + 0.3, trim);
        sb.box(x0, top, z1 - 0.3, x1, top + ph, z1, trim);
        sb.box(x0, top, z0, x0 + 0.3, top + ph, z1, trim);
        sb.box(x1 - 0.3, top, z0, x1, top + ph, z1, trim);
      }
      if (isRoof && roofAccess && !pitched) {
        this.lootSpots.push({ x: rr(x0 + sw + 1.5, x1 - sw - 1.5), y: top, z: rr(z0 + 1.5, z1 - 1.5), type: 'floor', poi });
      }
    }
    if (pitched) {
      sb.pyramid(x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4, y0 + floors * fh, pitched.rise ?? 2.6, pitched.color);
    }
    const b = { x, z, w, d, floors, fh, base, top: y0 + floors * fh, pitched: !!pitched, walls, roofAccess, trim, color, poi, doors };
    this.buildings.push(b);
    return b;
  }

  wallWithOpenings(axis, a0, a1, c0, c1, yb, h, ops, color, trim = null) {
    const sb = this.sb;
    ops.sort((p, q2) => p.c - q2.c);
    const seg = (s0, s1, y0, y1) => {
      if (s1 - s0 < 0.02 || y1 - y0 < 0.02) return;
      if (axis === 'x') sb.box(s0, yb + y0, c0, s1, yb + y1, c1, color);
      else sb.box(c0, yb + y0, s0, c1, yb + y1, s1, color);
    };
    // Trim pieces stick out past both faces of the wall.
    const trimBox = (s0, s1, y0, y1, out) => {
      if (axis === 'x') sb.box(s0, yb + y0, c0 - out, s1, yb + y1, c1 + out, trim);
      else sb.box(c0 - out, yb + y0, s0, c1 + out, yb + y1, s1, trim);
    };
    let cur = a0;
    for (const op of ops) {
      const oa = op.c - op.w / 2, ob = op.c + op.w / 2;
      seg(cur, oa, 0, h);
      if (op.y0 > 0) seg(oa, ob, 0, op.y0);
      seg(oa, ob, op.y1, h);
      if (trim && op.y1 < h) {
        if (op.y0 > 0) {
          // Window: sill, lintel and side frames.
          trimBox(oa - 0.18, ob + 0.18, op.y0 - 0.12, op.y0, 0.16);
          trimBox(oa - 0.12, ob + 0.12, op.y1, op.y1 + 0.14, 0.08);
          trimBox(oa - 0.12, oa, op.y0, op.y1, 0.06);
          trimBox(ob, ob + 0.12, op.y0, op.y1, 0.06);
        } else {
          // Door frame.
          trimBox(oa - 0.16, oa, 0, op.y1, 0.08);
          trimBox(ob, ob + 0.16, 0, op.y1, 0.08);
          trimBox(oa - 0.16, ob + 0.16, op.y1, op.y1 + 0.18, 0.1);
        }
      }
      cur = ob;
    }
    seg(cur, a1, 0, h);
  }

  // Free-standing wall (prison perimeter, fences) with gate gaps.
  perimeter(cx, cz, w, d, h, thick, color, gates = []) {
    const g = this.ground(cx, cz);
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const gate = (side) => (gates.includes(side) ? [{ c: 0, w: 9, y0: 0, y1: h + 1 }] : []);
    const mk = (side, axis, a0, a1, c0, c1) => {
      const ops = gate(side).map((o) => ({ ...o, c: (a0 + a1) / 2 }));
      this.wallWithOpenings(axis, a0, a1, c0, c1, g - 2, h + 2, ops.map((o) => ({ ...o, y1: h + 3 })), color);
    };
    mk('n', 'x', x0, x1, z0, z0 + thick);
    mk('s', 'x', x0, x1, z1 - thick, z1);
    mk('w', 'z', z0, z1, x0, x0 + thick);
    mk('e', 'z', z0, z1, x1 - thick, x1);
  }

  tower(x, z, h, color, topColor) {
    const g = this.ground(x, z);
    const sb = this.sb;
    for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      sb.box(x + dx - 0.25, g - 1, z + dz - 0.25, x + dx + 0.25, g + h, z + dz + 0.25, color);
    }
    sb.box(x - 2.6, g + h, z - 2.6, x + 2.6, g + h + 0.35, z + 2.6, topColor);
    for (const [ax, az, bx, bz] of [[-2.6, -2.6, 2.6, -2.3], [-2.6, 2.3, 2.6, 2.6], [-2.6, -2.6, -2.3, 2.6], [2.3, -2.6, 2.6, 2.6]]) {
      sb.box(x + ax, g + h + 0.35, z + az, x + bx, g + h + 1.3, z + bz, color);
    }
    sb.pyramid(x - 2.8, z - 2.8, x + 2.8, z + 2.8, g + h + 3.2, 1.4, topColor);
    for (const [dx, dz] of [[-2.4, -2.4], [2.4, 2.4], [-2.4, 2.4], [2.4, -2.4]]) {
      sb.box(x + dx - 0.12, g + h + 1.3, z + dz - 0.12, x + dx + 0.12, g + h + 3.2, z + dz + 0.12, color, false);
    }
    this.lootSpots.push({ x, y: g + h + 0.35, z, type: 'chest', poi: 'tower' });
  }

  // Is the footprint free of static geometry taller than knee height?
  free(x, z, hw, hd, pad = 0.4) {
    const g = this.ground(x, z);
    const list = this.col.query(x - hw - pad, z - hd - pad, x + hw + pad, z + hd + pad);
    return !list.some((c) => c.max.y > g + 0.4 && c.min.y < g + 6);
  }

  // ---------------------------------------------------------------- harvestables

  addHarvest(h) {
    h.id = this.harvestables.length;
    h.maxHp = h.hp;
    this.harvestables.push(h);
    if (h.collider) this.col.add(h.collider);
    return h;
  }

  // Parts are plain {pool, x, y, z, sx, sy, sz, q, color}: the renderer turns
  // them into instanced meshes.
  part(pool, x, y, z, sx, sy, sz, ry = 0, rx = 0, color) {
    return { pool, x, y, z, sx, sy, sz, q: quatFromEuler(rx, ry, 0), color };
  }

  tree(x, z, kind = R() < 0.5 ? 'pine' : 'round') {
    const g = this.ground(x, z);
    const s = rr(0.85, 1.35);
    const parts = [];
    const trunkH = kind === 'pine' ? 3 * s : 3.4 * s;
    parts.push(this.part('trunk', x, g - 0.2, z, s, trunkH, s));
    if (kind === 'pine') {
      parts.push(this.part('pine', x, g + 1.6 * s, z, 2.6 * s, 3.6 * s, 2.6 * s));
      parts.push(this.part('pine', x, g + 3.6 * s, z, 1.9 * s, 3.0 * s, 1.9 * s));
    } else {
      const col = ['#4cc23e', '#59cf3f', '#3db24a', '#7fd13b'][Math.floor(R() * 4)];
      parts.push(this.part('round', x, g + 4.1 * s, z, 2.3 * s, 2.0 * s, 2.3 * s, R() * 6, 0, col));
      parts.push(this.part('round', x + 0.9 * s, g + 3.5 * s, z + 0.5 * s, 1.5 * s, 1.4 * s, 1.5 * s, R() * 6, 0, col));
    }
    const r = 0.45 * s;
    return this.addHarvest({
      type: 'tree', mat: 'wood', hp: Math.round(150 * s), yieldPer: 9, parts,
      center: { x, y: g + 1.4, z },
      collider: makeBox(x - r, g - 1, z - r, x + r, g + 7 * s, z + r, 'harvest', null),
    });
  }

  palm(x, z) {
    const g = this.ground(x, z);
    const parts = [];
    const H = rr(6, 7.8), segs = 4;
    const lean = rr(0, Math.PI * 2), tilt = rr(0.08, 0.22);
    let px = x, py = g - 0.2, pz = z;
    for (let i = 0; i < segs; i++) {
      const len = H / segs;
      const q = quatFromAxisAngle(Math.cos(lean), 0, Math.sin(lean), tilt * (1 + i * 0.7));
      const w = 1 - i * 0.12;
      parts.push({ pool: 'palmTrunk', x: px, y: py, z: pz, sx: w, sy: len + 0.08, sz: w, q });
      const up = quatRotateUp(q, len);
      px += up.x; py += up.y; pz += up.z;
    }
    const greens = ['#3fb34f', '#4cc95a', '#2f9e48'];
    for (let i = 0; i < 7; i++) {
      const yaw = (i / 7) * Math.PI * 2 + rr(-0.2, 0.2);
      parts.push({
        pool: 'frond', x: px, y: py, z: pz, sx: 1.1, sy: 0.16, sz: rr(2.8, 3.6),
        q: quatFromEuler(rr(0.35, 0.65), yaw, 0, 'YXZ'), color: greens[i % 3],
      });
    }
    for (let i = 0; i < 3; i++) {
      parts.push(this.part('round', px + rr(-0.3, 0.3), py - 0.35, pz + rr(-0.3, 0.3), 0.22, 0.22, 0.22, 0, 0, '#6d4c2f'));
    }
    return this.addHarvest({
      type: 'tree', mat: 'wood', hp: 170, yieldPer: 9, parts,
      center: { x, y: g + 1.4, z },
      collider: makeBox(x - 0.35, g - 1, z - 0.35, x + 0.35, g + H, z + 0.35, 'harvest', null),
    });
  }

  rock(x, z) {
    const g = this.ground(x, z);
    const s = rr(1.1, 2.0);
    const shade = ['#a3a3a8', '#8f8f96', '#b1aca2'][Math.floor(R() * 3)];
    const part = this.part('rock', x, g + 0.4 * s, z, s * 1.3, s, s * 1.1, R() * 6, R(), shade);
    return this.addHarvest({
      type: 'rock', mat: 'brick', hp: Math.round(260 * s), yieldPer: 8, parts: [part],
      center: { x, y: g + 0.6 * s, z },
      collider: makeBox(x - s * 1.05, g - 1, z - s * 0.9, x + s * 1.05, g + 1.3 * s, z + s * 0.9, 'harvest', null),
    });
  }

  car(x, z, ry = R() * Math.PI) {
    if (!this.free(x, z, 2.4, 2.4)) return null;
    const g = this.ground(x, z);
    const col = ['#e74c3c', '#3498db', '#f1c40f', '#ecf0f1', '#9b59b6', '#1abc9c'][Math.floor(R() * 6)];
    const c = Math.cos(ry), s = Math.sin(ry);
    const off = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const [cx, cz] = off(0, -0.2);
    const parts = [
      this.part('body', x, g + 0.85, z, 2.0, 0.85, 4.3, ry, 0, col),
      this.part('cabin', cx, g + 1.55, cz, 1.75, 0.6, 2.2, ry),
    ];
    for (const [lx, lz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
      const [wx, wz] = off(lx, lz);
      parts.push(this.part('wheel', wx, g + 0.42, wz, 1, 1, 1, ry));
    }
    // Axis-aligned collider that covers the rotated car.
    const ex = Math.abs(1.0 * c) + Math.abs(2.15 * s), ez = Math.abs(1.0 * s) + Math.abs(2.15 * c);
    return this.addHarvest({
      type: 'car', mat: 'metal', hp: 420, yieldPer: 7, parts,
      center: { x, y: g + 1, z },
      collider: makeBox(x - ex, g, z - ez, x + ex, g + 1.85, z + ez, 'harvest', null),
    });
  }

  container(x, z, alongX = R() < 0.5, stackY = null) {
    const g = stackY ?? this.ground(x, z);
    const col = ['#d64541', '#2f80ed', '#27ae60', '#f39c12', '#8e44ad', '#e67e22'][Math.floor(R() * 6)];
    const w = alongX ? 6.1 : 2.45, d = alongX ? 2.45 : 6.1;
    const part = this.part('container', x, g + 1.3, z, w, 2.6, d, 0, 0, col);
    return this.addHarvest({
      type: 'container', mat: 'metal', hp: 600, yieldPer: 9, parts: [part],
      center: { x, y: g + 1.3, z },
      collider: makeBox(x - w / 2, g, z - d / 2, x + w / 2, g + 2.6, z + d / 2, 'harvest', null),
    });
  }

  crate(x, z, y = null) {
    const g = y ?? this.ground(x, z);
    const s = rr(0.9, 1.3);
    const part = this.part('crate', x, g + s / 2, z, s, s, s, R() * 1.5);
    return this.addHarvest({
      type: 'crate', mat: 'wood', hp: 90, yieldPer: 7, parts: [part],
      center: { x, y: g + s / 2, z },
      collider: makeBox(x - s * 0.6, g, z - s * 0.6, x + s * 0.6, g + s, z + s * 0.6, 'harvest', null),
    });
  }

  // Called when the pickaxe hits a harvestable. Returns materials gained.
  // `rng` is the match RNG: weak-point placement is runtime, not map data.
  hitHarvestable(h, point, normal, crit, rng) {
    const dmg = crit ? 100 : 50;
    h.hp -= dmg;
    const gained = Math.round(h.yieldPer * (crit ? 2 : 1));
    this.emit('harvestHit', { h });
    if (h.hp <= 0) {
      this.destroyHarvestable(h);
    } else {
      // Move the weak point somewhere new on the face we just hit.
      const n = new Vec3(normal.x, normal.y, normal.z);
      if (Math.abs(n.y) > 0.7) n.set(point.x - h.center.x, 0, point.z - h.center.z).normalize();
      const tangent = new Vec3(-n.z, 0, n.x);
      const base = new Vec3(point.x, point.y, point.z);
      h.weak = {
        pos: base.addScaledVector(tangent, rng.range(-0.5, 0.5)).add(new Vec3(0, rng.range(-0.3, 0.4), 0)).addScaledVector(n, 0.04),
        normal: n,
      };
    }
    return gained;
  }

  destroyHarvestable(h) {
    h.dead = true;
    if (h.collider) this.col.remove(h.collider);
    h.weak = null;
    this.emit('harvestBroken', { h });
  }

  // ---------------------------------------------------------------- destruction

  // Damage a chunk of the map. It darkens as it weakens, then shatters.
  // Returns true if it broke.
  damageStatic(el, dmg, rng) {
    if (el.dead || el.collapsing) return false;
    el.hp -= dmg;
    if (el.hp > 0) {
      this.emit('staticDamaged', { el, factor: 0.45 + 0.55 * (el.hp / el.maxHp) });
      return false;
    }
    this.destroyStatic(el, 'smash');
    this.collapseAround(el, rng);
    return true;
  }

  destroyStatic(el, mode = 'smash') {
    if (el.dead) return;
    el.dead = true;
    for (const c of el.colliders) this.col.remove(c);
    this.brokenThisTick++;
    this.emit('staticBroken', { el, mode });
  }

  grounded(el) {
    const y = el.min.y;
    const pts = [
      [el.min.x + 0.05, el.min.z + 0.05], [el.max.x - 0.05, el.min.z + 0.05],
      [el.min.x + 0.05, el.max.z - 0.05], [el.max.x - 0.05, el.max.z - 0.05],
      [(el.min.x + el.max.x) / 2, (el.min.z + el.max.z) / 2],
    ];
    return pts.some(([x, z]) => terrainHeight(x, z) >= y - 0.35);
  }

  neighbours(el) {
    const e = 0.06;
    const out = [];
    const list = this.col.query(el.min.x - e, el.min.z - e, el.max.x + e, el.max.z + e);
    for (const c of list) {
      const o = c.owner;
      if (c.kind !== 'static' || !o || o === el || o.dead || o.collapsing || !o.static) continue;
      if (c.min.y > el.max.y + e || c.max.y < el.min.y - e) continue;
      if (!out.includes(o)) out.push(o);
    }
    return out;
  }

  // Anything that was hanging off the broken chunk and no longer connects to
  // the ground falls apart, like Fortnite's structural integrity.
  collapseAround(broken, rng) {
    const seeds = this.neighbours({ ...broken, dead: false, static: false });
    const checked = new Set();
    for (const seed of seeds) {
      if (seed.dead || checked.has(seed)) continue;
      const visited = new Set([seed]);
      const queue = [seed];
      let supported = false;
      while (queue.length && !supported) {
        const el = queue.shift();
        if (this.grounded(el)) { supported = true; break; }
        if (visited.size > 3000) { supported = true; break; } // huge structure: assume it stands
        for (const n of this.neighbours(el)) {
          if (!visited.has(n)) { visited.add(n); queue.push(n); }
        }
      }
      for (const v of visited) checked.add(v);
      if (!supported) {
        // Crumble outward from the break over a second or so, instead of
        // everything vanishing at once.
        const bx = (broken.min.x + broken.max.x) / 2, by = (broken.min.y + broken.max.y) / 2, bz = (broken.min.z + broken.max.z) / 2;
        for (const v of visited) {
          v.collapsing = true;
          const d = Math.hypot((v.min.x + v.max.x) / 2 - bx, (v.min.y + v.max.y) / 2 - by, (v.min.z + v.max.z) / 2 - bz);
          this.pending.push({ el: v, at: this.time + 0.25 + Math.min(1.6, d * 0.06) + rng.random() * 0.1 });
          this.emit('staticDamaged', { el: v, factor: 0.6 });
        }
      }
    }
  }

  update(time) {
    this.time = time;
    this.brokenThisTick = 0;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (p.at > time) continue;
      this.pending.splice(i, 1);
      this.destroyStatic(p.el, 'fall');
    }
  }
}

// Point-of-interest builders live in pois.js and are mixed in here.
attachPois(World);
