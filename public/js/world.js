// Builds the island: terrain, water, every POI building, and the harvestable
// props (trees = wood, rocks = brick, cars/containers = metal).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeBox, makeSlope } from './collision.js';
import { terrainHeight, POIS, buildTerrainMesh, buildWater, TERRAIN_SIZE, distToRoad } from './terrain.js';
import { addStaticDetail, addInstancedDetail, addPalms } from './decor.js';
import { mapRand } from './util.js';
import { WATER_LEVEL } from './config.js';
import { weakPointTexture } from './textures.js';

const R = mapRand;
const rr = (a, b) => a + R() * (b - a);

// Collects static geometry into one merged, vertex-coloured mesh (one draw
// call for the whole island). Every wall, floor, roof and stair is split into
// chunks that each own a slice of that mesh and a collider, so any of them can
// be destroyed. Only the terrain itself is unbreakable.
const MAX_SPAN = 2.6; // wall chunk width
const MAX_SLAB = 5; // floor/roof chunk size
const MAX_RISE = 4.5; // chunk height

class StaticBuilder {
  constructor(collision) {
    this.col = collision;
    this.geos = [];
    this.owners = [];
    this.elements = [];
    this.tmpColor = new THREE.Color();
    this.mat = 'brick'; // material that breaking the next pieces gives
  }

  element(mat, volume) {
    const base = { wood: 140, brick: 220, metal: 320 }[mat];
    const el = {
      id: this.elements.length, mat, ranges: [], colliders: [], dead: false,
      hp: Math.round(base * Math.min(2.4, Math.max(0.45, volume / 6))),
    };
    el.maxHp = el.hp;
    this.elements.push(el);
    return el;
  }

  pushGeo(g, color, jitter = 0.04, owner = null) {
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
    this.owners.push(owner);
    if (owner) { owner.color = new THREE.Color(color).multiplyScalar(k); owner.hex = color; }
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
    if (h < 0.06 || !collide) {
      // Paint-thin decals (court lines) stay decorative.
      if (h < 0.06) {
        const g = new THREE.BoxGeometry(w, h, d);
        g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        this.pushGeo(g, color);
        return;
      }
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
          const g = new THREE.BoxGeometry(bx - ax, by - ay, bz - az);
          g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
          this.pushGeo(g, color, 0.04, el);
          this.addCollider(el, makeBox(ax, ay, az, bx, by, bz, 'static', el));
        }
      }
    }
  }

  // Stair ramp rising along +z from (zLow, y) to (zLow + run, y + rise).
  rampZ(x0, x1, zLow, run, y, rise, color) {
    const len = Math.hypot(run, rise);
    const g = new THREE.BoxGeometry(x1 - x0, 0.25, len);
    g.rotateX(-Math.atan2(rise, run));
    g.translate((x0 + x1) / 2, y + rise / 2 - 0.12, zLow + run / 2);
    const el = this.element('wood', 8);
    this.pushGeo(g, color, 0.04, el);
    const hf = (x, z) => {
      if (x < x0 || x > x1 || z < zLow || z > zLow + run) return null;
      return y + (rise * (z - zLow)) / run;
    };
    this.addCollider(el, makeSlope(x0, y, zLow, x1, y + rise, zLow + run, hf, 'static', el));
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
    const el = this.element('wood', ((x1 - x0) * (z1 - z0)) / 6);
    this.pushGeo(g, color, 0, el);
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
      const g = new THREE.CylinderGeometry(r, r, sh, seg);
      g.translate(x, sy + sh / 2, z);
      const el = this.element('metal', Math.PI * r * r * sh * 0.5 + 1);
      this.pushGeo(g, color, 0.04, el);
      const rr2 = Math.max(0.12, r * 0.85);
      this.addCollider(el, makeBox(x - rr2, sy, z - rr2, x + rr2, sy + sh, z + rr2, 'static', el));
    }
  }

  sphere(x, y, z, r, color) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(x, y, z);
    const el = this.element('metal', r * r * 2);
    this.pushGeo(g, color, 0.04, el);
    this.addCollider(el, makeBox(x - r * 0.8, y - r * 0.8, z - r * 0.8, x + r * 0.8, y + r * 0.8, z + r * 0.8, 'static', el));
  }

  finish() {
    // Record which vertex range of the merged mesh belongs to which chunk.
    let offset = 0;
    this.geos.forEach((g, i) => {
      const n = g.attributes.position.count;
      const el = this.owners[i];
      if (el) el.ranges.push([offset, n]);
      offset += n;
    });
    const merged = mergeGeometries(this.geos, false);
    merged.computeBoundingSphere();
    merged.attributes.position.setUsage(THREE.DynamicDrawUsage);
    merged.attributes.color.setUsage(THREE.DynamicDrawUsage);
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.geos = [];
    this.owners = [];
    this.mesh = mesh;
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
  constructor(scene, collision, opts = {}) {
    this.scene = scene;
    this.col = collision;
    this.detail = opts.detail || 'high';
    this.sb = new StaticBuilder(collision);
    this.lootSpots = [];
    this.harvestables = [];
    this.shaking = [];
    this.pending = [];
    this.time = 0;
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
    addStaticDetail(this, this.detail);
    addPalms(this, this.detail);
    this.scatterNature();
    this.scatterWildLoot();

    this.scene.add(this.sb.finish());
    addInstancedDetail(this, this.detail);
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
      palmTrunk: new Pool(new THREE.CylinderGeometry(0.2, 0.3, 1, 7).translate(0, 0.5, 0), lam('#a07a4f'), 300),
      frond: new Pool(new THREE.ConeGeometry(0.6, 1, 4).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), 600, true),
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

  palm(x, z) {
    const g = this.ground(x, z);
    const P = this.pools;
    const parts = [];
    const H = rr(6, 7.8), segs = 4;
    const lean = rr(0, Math.PI * 2), tilt = rr(0.08, 0.22);
    let px = x, py = g - 0.2, pz = z;
    const axis = new THREE.Vector3(Math.cos(lean), 0, Math.sin(lean));
    for (let i = 0; i < segs; i++) {
      const len = H / segs;
      const q2 = new THREE.Quaternion().setFromAxisAngle(axis, tilt * (1 + i * 0.7));
      const w = 1 - i * 0.12;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), q2, new THREE.Vector3(w, len + 0.08, w));
      parts.push({ pool: P.palmTrunk, m });
      const up = new THREE.Vector3(0, len, 0).applyQuaternion(q2);
      px += up.x; py += up.y; pz += up.z;
    }
    const greens = ['#3fb34f', '#4cc95a', '#2f9e48'];
    for (let i = 0; i < 7; i++) {
      const yaw = (i / 7) * Math.PI * 2 + rr(-0.2, 0.2);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(px, py, pz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(0.35, 0.65), yaw, 0, 'YXZ')),
        new THREE.Vector3(1.1, 0.16, rr(2.8, 3.6)),
      );
      parts.push({ pool: P.frond, m, color: greens[i % 3] });
    }
    for (let i = 0; i < 3; i++) {
      parts.push({ pool: P.round, m: compose(px + rr(-0.3, 0.3), py - 0.35, pz + rr(-0.3, 0.3), 0.22, 0.22, 0.22), color: '#6d4c2f' });
    }
    for (const p of parts) p.index = p.pool.add(p.m, p.color);
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

  // ---------------------------------------------------------------- destruction

  // Damage a chunk of the map. It darkens and cracks as it weakens, then
  // shatters. Returns true if it broke.
  damageStatic(el, dmg) {
    if (el.dead || el.collapsing) return false;
    el.hp -= dmg;
    if (el.hp > 0) {
      this.tintStatic(el, 0.45 + 0.55 * (el.hp / el.maxHp));
      return false;
    }
    this.destroyStatic(el, 'smash');
    this.collapseAround(el);
    return true;
  }

  tintStatic(el, factor) {
    const attr = this.sb.mesh.geometry.attributes.color;
    const c = el.color;
    if (!c) return;
    for (const [start, count] of el.ranges) {
      for (let i = start; i < start + count; i++) {
        attr.array[i * 3] = c.r * factor; attr.array[i * 3 + 1] = c.g * factor; attr.array[i * 3 + 2] = c.b * factor;
      }
      attr.addUpdateRange(start * 3, count * 3);
    }
    attr.needsUpdate = true;
  }

  destroyStatic(el, mode = 'smash') {
    if (el.dead) return;
    el.dead = true;
    for (const c of el.colliders) this.col.remove(c);
    if (el.onDestroy) el.onDestroy();
    const attr = this.sb.mesh.geometry.attributes.position;
    for (const [start, count] of el.ranges) {
      attr.array.fill(0, start * 3, (start + count) * 3);
      attr.addUpdateRange(start * 3, count * 3);
    }
    attr.needsUpdate = true;
    this.brokenThisFrame = (this.brokenThisFrame || 0) + 1;
    if (this.onStaticDestroyed) this.onStaticDestroyed(el, mode);
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
      if (c.kind !== 'static' || !o || o === el || o.dead || o.collapsing || o.ranges === undefined) continue;
      if (c.min.y > el.max.y + e || c.max.y < el.min.y - e) continue;
      if (!out.includes(o)) out.push(o);
    }
    return out;
  }

  // Anything that was hanging off the broken chunk and no longer connects to
  // the ground falls apart, like Fortnite's structural integrity.
  collapseAround(broken) {
    const seeds = this.neighbours({ ...broken, dead: false, ranges: [] });
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
          this.pending.push({ el: v, at: this.time + 0.25 + Math.min(1.6, d * 0.06) + Math.random() * 0.1 });
          this.tintStatic(v, 0.6);
        }
      }
    }
  }

  update(dt, time, focusHarvest) {
    this.time = time;
    if (this.pending.length) {
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const p = this.pending[i];
        if (p.at > time) continue;
        this.pending.splice(i, 1);
        this.destroyStatic(p.el, 'fall');
      }
    }
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
    if (this.water) this.water.userData.uniforms.uTime.value = time;
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
    this.sb.mat = 'brick';
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
    this.sb.mat = 'brick';
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
    this.sb.mat = 'metal';
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
    this.sb.mat = 'brick';
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
    this.sb.mat = 'brick';
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
    this.sb.mat = 'brick';
    const p = POIS.find((q2) => q2.id === 'harbor');
    const g = this.ground(p.x, p.z);
    this.building({ x: p.x + 8, z: p.z - 10, w: 18, d: 12, floors: 1, fh: 6, color: '#5d8aa8', trim: '#34495e', roofColor: '#2c3e50', doors: ['s', 'w'], poi: 'harbor' });
    // Wooden docks reaching out into the bay.
    this.sb.mat = 'wood';
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
    this.sb.mat = 'metal';
    this.sb.box(p.x + 20, g, p.z + 4, p.x + 21.2, g + 18, p.z + 5.2, '#f1c40f');
    this.sb.box(p.x + 20.6 - 1, g + 17, p.z - 4, p.x + 20.6 + 1, g + 18.2, p.z + 26, '#f1c40f', false);
  }

  buildLiving() {
    this.sb.mat = 'wood';
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
    this.sb.mat = 'metal';
    const p = POIS.find((q2) => q2.id === 'hq');
    this.building({ x: p.x, z: p.z, w: 24, d: 18, floors: 3, color: '#cdd5da', trim: '#2c3e50', roofColor: '#4b5563', upperColor: '#b9c6cf', doors: ['w', 's'], poi: 'hq' });
    const b = this.buildings[this.buildings.length - 1];
    this.sb.box(p.x - 5, b.top, p.z - 2, p.x + 5, b.top + 0.08, p.z + 6, '#f1c40f', false);
    this.sb.box(p.x - 3.6, b.top + 0.08, p.z - 0.6, p.x + 3.6, b.top + 0.12, p.z + 4.6, '#2c3e50', false);
    for (let i = 0; i < 3; i++) this.car(p.x - 20, p.z + rr(-10, 14), 0);
  }

  buildDecon() {
    this.sb.mat = 'metal';
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
    this.sb.mat = 'wood';
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
    this.sb.mat = 'metal';
    const p = POIS.find((q2) => q2.id === 'security');
    this.building({ x: p.x, z: p.z, w: 18, d: 12, floors: 2, color: '#a9b7c0', trim: '#2f3e46', roofColor: '#3d4b53', doors: ['s', 'e'], poi: 'security' });
    this.building({ x: p.x + 18, z: p.z + 10, w: 6, d: 6, floors: 1, color: '#f4d03f', trim: '#2f3e46', doors: ['w'], windows: true, roofAccess: false, poi: 'security' });
    for (let i = 0; i < 4; i++) {
      const x = p.x + rr(-16, 16), z = p.z + rr(10, 18);
      if (this.free(x, z, 3.2, 3.2)) this.container(x, z);
    }
  }

  buildConstruction() {
    this.sb.mat = 'metal';
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
    this.sb.mat = 'brick';
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
      if (distToRoad(x, z) < 5) continue;
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
