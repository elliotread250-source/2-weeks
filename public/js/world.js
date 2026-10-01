// Builds the island: terrain, water, every POI building, and the harvestable
// props (trees = wood, rocks = brick, cars/containers = metal).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBox, makeSlope } from './collision.js';
import { terrainHeight, POIS, buildTerrainMesh, buildWater, TERRAIN_SIZE } from './terrain.js';
import { mapRand } from './util.js';
import { WATER_LEVEL } from './config.js';
import { weakPointTexture } from './textures.js';

const R = mapRand;
const rr = (a, b) => a + R() * (b - a);

// Collects static boxes into one merged, vertex-coloured mesh (one draw call
// for every building on the island) and registers their colliders.
class StaticBuilder {
  constructor(collision) {
    this.col = collision;
    this.geos = [];
    this.tmpColor = new THREE.Color();
  }

  pushGeo(g, color, jitter = 0.04) {
    g.deleteAttribute('uv');
    const ng = g.index ? g.toNonIndexed() : g;
    const c = this.tmpColor.set(color);
    const k = 1 + (R() - 0.5) * jitter;
    const n = ng.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k;
    }
    ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(ng);
  }

  box(x0, y0, z0, x1, y1, z1, color, collide = true) {
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01 || z1 - z0 < 0.01) return;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.pushGeo(g, color);
    if (collide) this.col.add(makeBox(x0, y0, z0, x1, y1, z1, 'static', null));
  }

  // Stair ramp rising along +z from (zLow, y) to (zLow + run, y + rise).
  rampZ(x0, x1, zLow, run, y, rise, color) {
    const len = Math.hypot(run, rise);
    const g = new THREE.BoxGeometry(x1 - x0, 0.25, len);
    g.rotateX(-Math.atan2(rise, run));
    g.translate((x0 + x1) / 2, y + rise / 2 - 0.12, zLow + run / 2);
    this.pushGeo(g, color);
    const hf = (x, z) => {
      if (x < x0 || x > x1 || z < zLow || z > zLow + run) return null;
      return y + (rise * (z - zLow)) / run;
    };
    this.col.add(makeSlope(x0, y, zLow, x1, y + rise, zLow + run, hf, 'static', null));
  }

  // Four-sided pyramid roof with a matching walkable slope collider.
  pyramid(x0, z0, x1, z1, y, rise, color) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const v = [
      [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [cx, y + rise, cz],
    ];
    const tris = [[0, 4, 1], [1, 4, 2], [2, 4, 3], [3, 4, 0]];
    const pos = [];
    for (const t of tris) for (const i of t) pos.push(...v[i]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    this.pushGeo(g, color, 0);
    const hw = (x1 - x0) / 2, hd = (z1 - z0) / 2;
    const hf = (x, z) => {
      if (x < x0 || x > x1 || z < z0 || z > z1) return null;
      const k = Math.max(Math.abs(x - cx) / hw, Math.abs(z - cz) / hd);
      return y + rise * (1 - k);
    };
    this.col.add(makeSlope(x0, y, z0, x1, y + rise, z1, hf, 'static', null));
  }

  cylinder(x, y, z, r, h, color, collide = true, seg = 10) {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    g.translate(x, y + h / 2, z);
    this.pushGeo(g, color);
    if (collide) this.col.add(makeBox(x - r * 0.85, y, z - r * 0.85, x + r * 0.85, y + h, z + r * 0.85, 'static', null));
  }

  sphere(x, y, z, r, color) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(x, y, z);
    this.pushGeo(g, color);
  }

  finish() {
    const merged = mergeGeometries(this.geos, false);
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.geos = [];
    return mesh;
  }
}

// Instanced props that can be hidden one at a time when harvested.
class Pool {
  constructor(geo, mat, max, colored = false) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.colored = colored;
    if (colored) this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  }
  add(matrix, color) {
    const i = this.mesh.count++;
    this.mesh.setMatrixAt(i, matrix);
    if (this.colored) this.mesh.setColorAt(i, new THREE.Color(color));
    return i;
  }
  set(i, matrix) {
    this.mesh.setMatrixAt(i, matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v3 = new THREE.Vector3();
const s3 = new THREE.Vector3();

function compose(x, y, z, sx, sy, sz, ry = 0, rx = 0) {
  q.setFromEuler(new THREE.Euler(rx, ry, 0));
  return new THREE.Matrix4().compose(v3.set(x, y, z), q, s3.set(sx, sy, sz));
}

export class World {
  constructor(scene, collision) {
    this.scene = scene;
    this.col = collision;
    this.sb = new StaticBuilder(collision);
    this.lootSpots = [];
    this.harvestables = [];
    this.shaking = [];
    this.buildings = [];
  }

  build() {
    this.scene.add(buildTerrainMesh());
    this.water = buildWater();
    this.scene.add(this.water);
    this.makePools();

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
    this.scatterNature();
    this.scatterWildLoot();

    this.scene.add(this.sb.finish());
    for (const p of Object.values(this.pools)) {
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
      p.mesh.computeBoundingSphere();
      this.scene.add(p.mesh);
    }
    this.addClouds();

    this.weakSprite = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({ map: weakPointTexture(), transparent: true, depthTest: false }),
    );
    this.weakSprite.renderOrder = 10;
    this.weakSprite.visible = false;
    this.scene.add(this.weakSprite);
  }

  makePools() {
    const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 1, 6).translate(0, 0.5, 0);
    const pineGeo = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
    const roundGeo = new THREE.IcosahedronGeometry(1, 0);
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10).rotateZ(Math.PI / 2);
    const white = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    this.pools = {
      trunk: new Pool(trunkGeo, lam('#8a5a2b'), 400),
      pine: new Pool(pineGeo, lam('#2f9e48'), 800),
      round: new Pool(roundGeo, white, 900, true),
      rock: new Pool(rockGeo, white, 200, true),
      body: new Pool(boxGeo, white, 120, true),
      cabin: new Pool(boxGeo, lam('#2c3e50'), 60),
      wheel: new Pool(wheelGeo, lam('#1b1b1b'), 240),
      container: new Pool(boxGeo, white, 140, true),
      crate: new Pool(boxGeo, lam('#b37a3f'), 160),
    };
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
          this.wallWithOpenings(s.axis, s.a0, s.a1, s.c0, s.c1, yb, fh, ops, L === 0 ? color : (o.upperColor || color));
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
    const b = { x, z, w, d, floors, fh, base, top: y0 + floors * fh };
    this.buildings.push(b);
    return b;
  }

  wallWithOpenings(axis, a0, a1, c0, c1, yb, h, ops, color) {
    const sb = this.sb;
    ops.sort((p, q2) => p.c - q2.c);
    const seg = (s0, s1, y0, y1) => {
      if (s1 - s0 < 0.02 || y1 - y0 < 0.02) return;
      if (axis === 'x') sb.box(s0, yb + y0, c0, s1, yb + y1, c1, color);
      else sb.box(c0, yb + y0, s0, c1, yb + y1, s1, color);
    };
    let cur = a0;
    for (const op of ops) {
      const oa = op.c - op.w / 2, ob = op.c + op.w / 2;
      seg(cur, oa, 0, h);
      if (op.y0 > 0) seg(oa, ob, 0, op.y0);
      seg(oa, ob, op.y1, h);
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
    h.maxHp = h.hp;
    this.harvestables.push(h);
    if (h.collider) this.col.add(h.collider);
    return h;
  }

  tree(x, z, kind = R() < 0.5 ? 'pine' : 'round') {
    const g = this.ground(x, z);
    const s = rr(0.85, 1.35);
    const P = this.pools;
    const parts = [];
    const trunkH = kind === 'pine' ? 3 * s : 3.4 * s;
    parts.push({ pool: P.trunk, m: compose(x, g - 0.2, z, s, trunkH, s) });
    if (kind === 'pine') {
      parts.push({ pool: P.pine, m: compose(x, g + 1.6 * s, z, 2.6 * s, 3.6 * s, 2.6 * s) });
      parts.push({ pool: P.pine, m: compose(x, g + 3.6 * s, z, 1.9 * s, 3.0 * s, 1.9 * s) });
    } else {
      const col = ['#4cc23e', '#59cf3f', '#3db24a', '#7fd13b'][Math.floor(R() * 4)];
      parts.push({ pool: P.round, m: compose(x, g + 4.1 * s, z, 2.3 * s, 2.0 * s, 2.3 * s, R() * 6), color: col });
      parts.push({ pool: P.round, m: compose(x + 0.9 * s, g + 3.5 * s, z + 0.5 * s, 1.5 * s, 1.4 * s, 1.5 * s, R() * 6), color: col });
    }
    for (const p of parts) p.index = p.pool.add(p.m, p.color);
    const r = 0.45 * s;
    return this.addHarvest({
      type: 'tree', mat: 'wood', hp: Math.round(150 * s), yieldPer: 9, parts,
      center: { x, y: g + 1.4, z },
      collider: makeBox(x - r, g - 1, z - r, x + r, g + 7 * s, z + r, 'harvest', null),
    });
  }

  rock(x, z) {
    const g = this.ground(x, z);
    const s = rr(1.1, 2.0);
    const shade = ['#a3a3a8', '#8f8f96', '#b1aca2'][Math.floor(R() * 3)];
    const part = { pool: this.pools.rock, m: compose(x, g + 0.4 * s, z, s * 1.3, s, s * 1.1, R() * 6, R()), color: shade };
    part.index = part.pool.add(part.m, part.color);
    return this.addHarvest({
      type: 'rock', mat: 'brick', hp: Math.round(260 * s), yieldPer: 8, parts: [part],
      center: { x, y: g + 0.6 * s, z },
      collider: makeBox(x - s * 1.05, g - 1, z - s * 0.9, x + s * 1.05, g + 1.3 * s, z + s * 0.9, 'harvest', null),
    });
  }

  car(x, z, ry = R() * Math.PI) {
    if (!this.free(x, z, 2.4, 2.4)) return null;
    const g = this.ground(x, z);
    const P = this.pools;
    const col = ['#e74c3c', '#3498db', '#f1c40f', '#ecf0f1', '#9b59b6', '#1abc9c'][Math.floor(R() * 6)];
    const c = Math.cos(ry), s = Math.sin(ry);
    const off = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const parts = [
      { pool: P.body, m: compose(x, g + 0.85, z, 2.0, 0.85, 4.3, ry), color: col },
      { pool: P.cabin, m: compose(...[off(0, -0.2)].flatMap(([a, b]) => [a, g + 1.55, b]), 1.75, 0.6, 2.2, ry) },
    ];
    for (const [lx, lz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
      const [wx, wz] = off(lx, lz);
      parts.push({ pool: P.wheel, m: compose(wx, g + 0.42, wz, 1, 1, 1, ry) });
    }
    for (const p of parts) p.index = p.pool.add(p.m, p.color);
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
    const part = { pool: this.pools.container, m: compose(x, g + 1.3, z, w, 2.6, d), color: col };
    part.index = part.pool.add(part.m, part.color);
    return this.addHarvest({
      type: 'container', mat: 'metal', hp: 600, yieldPer: 9, parts: [part],
      center: { x, y: g + 1.3, z },
      collider: makeBox(x - w / 2, g, z - d / 2, x + w / 2, g + 2.6, z + d / 2, 'harvest', null),
    });
  }

  crate(x, z, y = null) {
    const g = y ?? this.ground(x, z);
    const s = rr(0.9, 1.3);
    const part = { pool: this.pools.crate, m: compose(x, g + s / 2, z, s, s, s, R() * 1.5) };
    part.index = part.pool.add(part.m);
    return this.addHarvest({
      type: 'crate', mat: 'wood', hp: 90, yieldPer: 7, parts: [part],
      center: { x, y: g + s / 2, z },
      collider: makeBox(x - s * 0.6, g, z - s * 0.6, x + s * 0.6, g + s, z + s * 0.6, 'harvest', null),
    });
  }

  // Called when the pickaxe hits a harvestable. Returns materials gained.
  hitHarvestable(h, point, normal, crit) {
    const dmg = crit ? 100 : 50;
    h.hp -= dmg;
    const gained = Math.round(h.yieldPer * (crit ? 2 : 1));
    h.shakeT = 0.25;
    if (!this.shaking.includes(h)) this.shaking.push(h);
    if (h.hp <= 0) {
      this.destroyHarvestable(h);
    } else {
      // Move the weak point somewhere new on the face we just hit.
      const n = new THREE.Vector3(normal.x, normal.y, normal.z);
      if (Math.abs(n.y) > 0.7) n.set(point.x - h.center.x, 0, point.z - h.center.z).normalize();
      const tangent = new THREE.Vector3(-n.z, 0, n.x);
      const base = new THREE.Vector3(point.x, point.y, point.z);
      h.weak = {
        pos: base.clone().addScaledVector(tangent, rr(-0.5, 0.5)).add(new THREE.Vector3(0, rr(-0.3, 0.4), 0)).addScaledVector(n, 0.04),
        normal: n,
      };
    }
    return gained;
  }

  destroyHarvestable(h) {
    h.dead = true;
    for (const p of h.parts) p.pool.set(p.index, ZERO);
    if (h.collider) this.col.remove(h.collider);
    h.weak = null;
  }

  update(dt, time, focusHarvest) {
    for (let i = this.shaking.length - 1; i >= 0; i--) {
      const h = this.shaking[i];
      h.shakeT -= dt;
      if (h.dead) { this.shaking.splice(i, 1); continue; }
      const amp = Math.max(0, h.shakeT) * 0.35;
      for (const p of h.parts) {
        m4.copy(p.m);
        m4.elements[12] += Math.sin(time * 70) * amp;
        m4.elements[14] += Math.cos(time * 63) * amp;
        p.pool.set(p.index, h.shakeT > 0 ? m4 : p.m);
      }
      if (h.shakeT <= 0) this.shaking.splice(i, 1);
    }
    if (this.water) this.water.position.y = WATER_LEVEL + Math.sin(time * 0.8) * 0.06;
    // Weak point marker on whatever the player is harvesting.
    if (focusHarvest && focusHarvest.weak && !focusHarvest.dead) {
      const w = focusHarvest.weak;
      this.weakSprite.visible = true;
      this.weakSprite.position.copy(w.pos);
      this.weakSprite.lookAt(w.pos.clone().add(w.normal));
    } else {
      this.weakSprite.visible = false;
    }
  }

  // ---------------------------------------------------------------- POIs

  buildPrison() {
    // Rebirth's landmark: a hilltop cell block inside a walled yard.
    const cx = 0, cz = -15;
    this.building({ x: cx, z: cz - 12, w: 46, d: 18, floors: 3, color: '#cfc8b8', trim: '#8a8172', roofColor: '#7d776d', doors: ['s', 'e', 'w'], poi: 'prison' });
    this.building({ x: cx - 30, z: cz + 12, w: 14, d: 22, floors: 2, color: '#c2b8a3', trim: '#827765', doors: ['e', 'n'], poi: 'prison' });
    this.building({ x: cx + 28, z: cz + 14, w: 16, d: 14, floors: 2, color: '#b8c4c9', trim: '#6b7a80', doors: ['w', 'n'], poi: 'prison' });
    this.perimeter(cx, cz, 104, 84, 5.5, 1.2, '#9c968a', ['n', 's', 'e', 'w']);
    this.tower(cx - 50, cz - 40, 9, '#7b7468', '#c0392b');
    this.tower(cx + 50, cz - 40, 9, '#7b7468', '#c0392b');
    this.tower(cx - 50, cz + 40, 9, '#7b7468', '#c0392b');
    this.tower(cx + 50, cz + 40, 9, '#7b7468', '#c0392b');
    // Yard: basketball court and cover.
    const g = this.ground(cx, cz + 18);
    this.sb.box(cx - 8, g + 0.01, cz + 12, cx + 8, g + 0.06, cz + 26, '#d86f3a', false);
    for (let i = 0; i < 6; i++) this.crate(cx + rr(-14, 14), cz + rr(10, 32));
    for (let i = 0; i < 4; i++) this.sb.box(cx - 18 + i * 12, g, cz + 6, cx - 15 + i * 12, g + 1.2, cz + 7, '#a7a399');
    this.lootSpots.push({ x: cx, y: g, z: cz + 20, type: 'chest', poi: 'prison' });
  }

  buildControl() {
    const p = POIS.find((q2) => q2.id === 'control');
    this.building({ x: p.x, z: p.z, w: 26, d: 16, floors: 2, color: '#e3ddd0', trim: '#5c6f7b', roofColor: '#536470', doors: ['n', 's'], poi: 'control' });
    const b = this.buildings[this.buildings.length - 1];
    this.sb.cylinder(p.x + 7, b.top, p.z, 0.25, 4, '#cccccc', false);
    this.sb.sphere(p.x + 7, b.top + 4.6, p.z, 1.3, '#f2f2f2');
    this.sb.cylinder(p.x - 9, b.top, p.z - 4, 0.12, 7, '#d0d0d0', false, 6);
    this.building({ x: p.x + 20, z: p.z + 10, w: 10, d: 10, floors: 1, color: '#d8cbb5', trim: '#7d6e58', doors: ['w'], pitched: { color: '#2e86de' }, poi: 'control' });
    for (let i = 0; i < 3; i++) this.car(p.x + rr(-18, 18), p.z + rr(12, 20));
  }

  buildBio() {
    const p = POIS.find((q2) => q2.id === 'bio');
    this.building({ x: p.x, z: p.z, w: 24, d: 16, floors: 3, color: '#f0f2f2', trim: '#2f6fb3', roofColor: '#9aa7b0', upperColor: '#e6ebee', doors: ['s', 'w'], poi: 'bio' });
    this.building({ x: p.x - 20, z: p.z + 14, w: 12, d: 12, floors: 1, color: '#e9eef0', trim: '#2f6fb3', doors: ['e'], poi: 'bio' });
    for (let i = 0; i < 5; i++) {
      const x = p.x + rr(-20, 20), z = p.z + rr(10, 22);
      if (this.free(x, z, 3.2, 3.2)) this.container(x, z);
    }
    this.sb.cylinder(p.x + 16, this.ground(p.x + 16, p.z - 4), p.z - 4, 2.2, 7, '#bfe3c9');
  }

  buildChem() {
    const p = POIS.find((q2) => q2.id === 'chem');
    this.building({ x: p.x + 4, z: p.z, w: 24, d: 14, floors: 2, color: '#d9d2bf', trim: '#a0522d', roofColor: '#6f6457', doors: ['s', 'e'], poi: 'chem' });
    const g = this.ground(p.x - 14, p.z + 12);
    for (const [dx, dz] of [[-16, 12], [-10, 16], [-16, 20]]) {
      this.sb.cylinder(p.x + dx, g, p.z + dz, 2.4, 8, '#e8e8e8');
      this.sb.box(p.x + dx - 2.6, g + 8, p.z + dz - 0.2, p.x + dx + 2.6, g + 8.4, p.z + dz + 0.2, '#f39c12', false);
    }
    this.sb.box(p.x - 18, g + 5, p.z + 8, p.x + 2, g + 5.5, p.z + 8.5, '#c0c0c0', false);
    for (let i = 0; i < 4; i++) this.crate(p.x + rr(-6, 14), p.z + rr(9, 18));
  }

  buildFactory() {
    const p = POIS.find((q2) => q2.id === 'factory');
    this.building({ x: p.x, z: p.z, w: 36, d: 22, floors: 1, fh: 8, color: '#b45d3a', trim: '#5a5a5a', roofColor: '#5d6d7e', doors: ['e', 'w', 's'], poi: 'factory' });
    const g = this.ground(p.x, p.z);
    this.sb.cylinder(p.x - 12, g + 8.2, p.z - 6, 1.2, 14, '#8e3b26');
    this.sb.cylinder(p.x - 6, g + 8.2, p.z - 6, 1.2, 11, '#8e3b26');
    // Mezzanine catwalk inside with a ramp up.
    this.sb.box(p.x - 8, g + 4.1, p.z + 6.5, p.x + 17, g + 4.4, p.z + 10.6, '#7f8c8d');
    this.sb.rampZ(p.x + 10, p.x + 12.4, p.z, 6.5, g + 0.2, 4.2, '#7f8c8d');
    this.lootSpots.push({ x: p.x + 2, y: g + 4.4, z: p.z + 8.5, type: 'chest', poi: 'factory' });
    this.building({ x: p.x + 4, z: p.z + 22, w: 14, d: 10, floors: 2, color: '#d5c4a1', trim: '#5a5a5a', doors: ['n', 'e'], poi: 'factory' });
    for (let i = 0; i < 6; i++) {
      const x = p.x + rr(-24, 24), z = p.z + rr(-24, -14);
      if (this.free(x, z, 3.2, 3.2)) this.container(x, z, true);
    }
    for (let i = 0; i < 3; i++) this.car(p.x + rr(20, 28), p.z + rr(-10, 12), Math.PI / 2);
  }

  buildHarbor() {
    const p = POIS.find((q2) => q2.id === 'harbor');
    const g = this.ground(p.x, p.z);
    this.building({ x: p.x + 8, z: p.z - 10, w: 18, d: 12, floors: 1, fh: 6, color: '#5d8aa8', trim: '#34495e', roofColor: '#2c3e50', doors: ['s', 'w'], poi: 'harbor' });
    // Wooden docks reaching out into the bay.
    for (const [dx, len] of [[-14, 30], [0, 24], [14, 34]]) {
      this.sb.box(p.x + dx - 2.5, g - 0.3, p.z + 10, p.x + dx + 2.5, g + 0.1, p.z + 10 + len, '#a0703f');
      for (let k = 0; k <= len; k += 6) {
        this.sb.box(p.x + dx - 2.6, -6, p.z + 10 + k - 0.2, p.x + dx - 2.2, g - 0.3, p.z + 10 + k + 0.2, '#6e4b2a', false);
        this.sb.box(p.x + dx + 2.2, -6, p.z + 10 + k - 0.2, p.x + dx + 2.6, g - 0.3, p.z + 10 + k + 0.2, '#6e4b2a', false);
      }
      this.lootSpots.push({ x: p.x + dx, y: g + 0.1, z: p.z + 10 + len - 3, type: R() < 0.5 ? 'chest' : 'floor', poi: 'harbor' });
    }
    // Container stacks.
    for (let row = 0; row < 3; row++) {
      for (let col2 = 0; col2 < 3; col2++) {
        const x = p.x - 18 + col2 * 7, z = p.z - 14 + row * 4;
        if (!this.free(x, z, 3.1, 1.3)) continue;
        this.container(x, z, true);
        if (R() < 0.45) this.container(x, z, true, g + 2.6);
      }
    }
    // Dock crane.
    this.sb.box(p.x + 20, g, p.z + 4, p.x + 21.2, g + 18, p.z + 5.2, '#f1c40f');
    this.sb.box(p.x + 20.6 - 1, g + 17, p.z - 4, p.x + 20.6 + 1, g + 18.2, p.z + 26, '#f1c40f', false);
  }

  buildLiving() {
    // Pleasant Park energy: a ring of colourful two-storey houses.
    const p = POIS.find((q2) => q2.id === 'living');
    const roofs = ['#e74c3c', '#2e86de', '#27ae60', '#f39c12', '#8e44ad', '#16a085'];
    const walls = ['#f5e6c8', '#e8d5b9', '#f0f0e6', '#dfe7ec', '#f3d9d0', '#e7efd8'];
    const spots = [[-18, -14], [0, -18], [18, -14], [-18, 14], [0, 18], [18, 14]];
    spots.forEach(([dx, dz], i) => {
      this.building({
        x: p.x + dx, z: p.z + dz, w: 11, d: 10, floors: 2, fh: 3.8, color: walls[i], trim: '#7f6a55',
        floorColor: '#b7966e', doors: [dz < 0 ? 's' : 'n'], pitched: { color: roofs[i], rise: 3 }, roofAccess: false, poi: 'living',
      });
    });
    const g = this.ground(p.x, p.z);
    this.sb.box(p.x - 3, g, p.z - 3, p.x + 3, g + 0.4, p.z + 3, '#8fd16a');
    this.sb.cylinder(p.x, g + 0.4, p.z, 0.3, 4.5, '#7f8c8d', true, 8);
    for (let i = 0; i < 4; i++) this.car(p.x + rr(-24, 24), p.z + rr(-4, 4), Math.PI / 2);
    this.lootSpots.push({ x: p.x + 4, y: g, z: p.z, type: 'chest', poi: 'living' });
  }

  buildHQ() {
    const p = POIS.find((q2) => q2.id === 'hq');
    this.building({ x: p.x, z: p.z, w: 24, d: 18, floors: 3, color: '#cdd5da', trim: '#2c3e50', roofColor: '#4b5563', upperColor: '#b9c6cf', doors: ['w', 's'], poi: 'hq' });
    const b = this.buildings[this.buildings.length - 1];
    this.sb.box(p.x - 5, b.top, p.z - 2, p.x + 5, b.top + 0.08, p.z + 6, '#f1c40f', false);
    this.sb.box(p.x - 3.6, b.top + 0.08, p.z - 0.6, p.x + 3.6, b.top + 0.12, p.z + 4.6, '#2c3e50', false);
    for (let i = 0; i < 3; i++) this.car(p.x - 20, p.z + rr(-10, 14), 0);
  }

  buildDecon() {
    const p = POIS.find((q2) => q2.id === 'decon');
    for (const [dx, dz] of [[-10, -6], [6, -8], [-4, 10]]) {
      const x = p.x + dx, z = p.z + dz, g = this.ground(x, z);
      for (const [ox, oz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
        this.sb.box(x + ox - 0.12, g, z + oz - 0.12, x + ox + 0.12, g + 2.8, z + oz + 0.12, '#dcdcdc');
      }
      this.sb.pyramid(x - 4, z - 4, x + 4, z + 4, g + 2.8, 2.2, '#f7f7f7');
      this.lootSpots.push({ x, y: g, z, type: R() < 0.5 ? 'chest' : 'floor', poi: 'decon' });
    }
    for (let i = 0; i < 7; i++) {
      const x = p.x + rr(-20, 20), z = p.z + rr(-20, 20);
      if (this.free(x, z, 3.3, 3.3)) this.container(x, z);
    }
    for (let i = 0; i < 6; i++) {
      const x = p.x + rr(-18, 18), z = p.z + rr(-18, 18), g = this.ground(x, z);
      if (this.free(x, z, 1.6, 0.5)) this.sb.box(x - 1.5, g, z - 0.4, x + 1.5, g + 1.1, z + 0.4, '#e2b13c');
    }
  }

  buildShore() {
    const p = POIS.find((q2) => q2.id === 'shore');
    const huts = ['#f8c471', '#76d7c4', '#f1948a'];
    [-14, 0, 14].forEach((dx, i) => {
      this.building({ x: p.x + dx, z: p.z - 6, w: 8, d: 8, floors: 1, fh: 3.6, color: huts[i], trim: '#a0703f', doors: ['s'], pitched: { color: '#a0703f', rise: 2 }, roofAccess: false, poi: 'shore' });
    });
    const g = this.ground(p.x, p.z + 8);
    for (let i = 0; i < 4; i++) {
      const x = p.x + rr(-16, 16), z = p.z + rr(6, 12);
      this.sb.cylinder(x, g, z, 0.06, 2.4, '#ffffff', false, 6);
      const cone = new THREE.ConeGeometry(1.6, 0.7, 8);
      cone.translate(x, g + 2.6, z);
      this.sb.pushGeo(cone, ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71'][i]);
    }
    // Lifeguard tower.
    this.tower(p.x + 26, p.z + 4, 4.5, '#ffffff', '#e74c3c');
  }

  buildSecurity() {
    const p = POIS.find((q2) => q2.id === 'security');
    this.building({ x: p.x, z: p.z, w: 18, d: 12, floors: 2, color: '#a9b7c0', trim: '#2f3e46', roofColor: '#3d4b53', doors: ['s', 'e'], poi: 'security' });
    this.building({ x: p.x + 18, z: p.z + 10, w: 6, d: 6, floors: 1, color: '#f4d03f', trim: '#2f3e46', doors: ['w'], windows: true, roofAccess: false, poi: 'security' });
    for (let i = 0; i < 4; i++) {
      const x = p.x + rr(-16, 16), z = p.z + rr(10, 18);
      if (this.free(x, z, 3.2, 3.2)) this.container(x, z);
    }
  }

  buildConstruction() {
    const p = POIS.find((q2) => q2.id === 'construction');
    this.building({ x: p.x, z: p.z, w: 20, d: 14, floors: 3, color: '#b0a89a', trim: '#8c857a', floorColor: '#9e978b', roofColor: '#9e978b', walls: false, parapet: false, poi: 'construction' });
    const g = this.ground(p.x, p.z);
    // Tower crane.
    this.sb.box(p.x + 14, g, p.z - 10, p.x + 15.4, g + 26, p.z - 8.6, '#f39c12');
    this.sb.box(p.x - 6, g + 25, p.z - 10, p.x + 24, g + 26.4, p.z - 8.6, '#f39c12', false);
    this.sb.box(p.x + 20, g + 18, p.z - 9.8, p.x + 22, g + 19.5, p.z - 8.8, '#7f8c8d', false);
    for (let i = 0; i < 8; i++) this.crate(p.x + rr(-14, 14), p.z + rr(9, 16));
    for (let i = 0; i < 2; i++) this.container(p.x + rr(-14, -10), p.z + rr(-14, -9), true);
  }

  buildLighthouse() {
    const x = -170, z = -70;
    const g = this.ground(x, z);
    if (g < 1) return;
    this.sb.cylinder(x, g, z, 3, 16, '#f5f5f5');
    this.sb.cylinder(x, g + 5, z, 3.05, 2.5, '#e74c3c', false);
    this.sb.cylinder(x, g + 11, z, 3.05, 2.5, '#e74c3c', false);
    this.sb.box(x - 3.5, g + 16, z - 3.5, x + 3.5, g + 16.3, z + 3.5, '#34495e');
    this.sb.cylinder(x, g + 16.3, z, 1.6, 2.2, '#f9e79f', false);
    this.sb.pyramid(x - 2.2, z - 2.2, x + 2.2, z + 2.2, g + 18.5, 1.6, '#e74c3c');
    this.lootSpots.push({ x: x + 2.4, y: g + 16.3, z, type: 'chest', poi: 'lighthouse' });
  }

  scatterNature() {
    let trees = 0, rocks = 0, cars = 0;
    for (let tries = 0; tries < 6000 && (trees < 300 || rocks < 80); tries++) {
      const x = rr(-TERRAIN_SIZE / 2 + 20, TERRAIN_SIZE / 2 - 20);
      const z = rr(-TERRAIN_SIZE / 2 + 20, TERRAIN_SIZE / 2 - 20);
      const h = this.ground(x, z);
      if (h < 2.5) continue;
      if (POIS.some((p) => Math.hypot(x - p.x, z - p.z) < p.pad + 3)) continue;
      const slope = Math.abs(this.ground(x + 1, z) - this.ground(x - 1, z)) + Math.abs(this.ground(x, z + 1) - this.ground(x, z - 1));
      if (slope > 2.2) continue;
      if (!this.free(x, z, 1.6, 1.6)) continue;
      if (rocks < 80 && R() < 0.22) { this.rock(x, z); rocks++; }
      else if (trees < 300) { this.tree(x, z); trees++; }
    }
    // A few abandoned cars along the "roads" between POIs.
    for (let i = 0; i < 40 && cars < 14; i++) {
      const a = POIS[Math.floor(R() * POIS.length)], b = POIS[Math.floor(R() * POIS.length)];
      if (a === b) continue;
      const t = rr(0.3, 0.7);
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (this.ground(x, z) < 2) continue;
      if (this.car(x, z, Math.atan2(b.x - a.x, b.z - a.z))) cars++;
    }
  }

  scatterWildLoot() {
    // Chests hidden out in the trees, like Fortnite's off-POI chests.
    let n = 0;
    for (let tries = 0; tries < 400 && n < 18; tries++) {
      const x = rr(-180, 180), z = rr(-170, 170);
      const g = this.ground(x, z);
      if (g < 3) continue;
      if (POIS.some((p) => Math.hypot(x - p.x, z - p.z) < p.pad + 8)) continue;
      if (!this.free(x, z, 1, 1)) continue;
      this.lootSpots.push({ x, y: g, z, type: n % 3 === 0 ? 'ammo' : 'chest', poi: null });
      n++;
    }
  }

  addClouds() {
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#dfe9f5', emissiveIntensity: 0.35 });
    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.clouds = new THREE.Group();
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(R() * 4);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(geo, mat);
        m.scale.set(rr(9, 16), rr(5, 8), rr(8, 13));
        m.position.set(k * rr(8, 12) - n * 5, rr(-2, 3), rr(-5, 5));
        c.add(m);
      }
      c.position.set(rr(-400, 400), rr(150, 190), rr(-400, 400));
      this.clouds.add(c);
    }
    this.scene.add(this.clouds);
  }
}
