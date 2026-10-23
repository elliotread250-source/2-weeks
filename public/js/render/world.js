// Draws the island from the sim's world data: one merged vertex-coloured mesh
// for every breakable chunk, instanced props for trees/rocks/cars, terrain,
// water, clouds and POI signs. It never owns gameplay state; it reacts to the
// world events the match emits (damage tint, shatter, harvest hits).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '/shared/math/util.js';
import { buildTerrainMesh, buildWater } from './terrain.js';
import { addRoads, addGrassAndBushes, makeSignMeshes } from './decor.js';
import { weakPointTexture } from './textures.js';

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
const tmpColor = new THREE.Color();

function primGeometry(p) {
  let g;
  switch (p.k) {
    case 'box':
      g = new THREE.BoxGeometry(p.x1 - p.x0, p.y1 - p.y0, p.z1 - p.z0);
      g.translate((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, (p.z0 + p.z1) / 2);
      break;
    case 'ramp': {
      const len = Math.hypot(p.run, p.rise);
      g = new THREE.BoxGeometry(p.x1 - p.x0, 0.25, len);
      g.rotateX(-Math.atan2(p.rise, p.run));
      g.translate((p.x0 + p.x1) / 2, p.y + p.rise / 2 - 0.12, p.zLow + p.run / 2);
      break;
    }
    case 'pyramid': {
      const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
      const v = [[p.x0, p.y, p.z0], [p.x1, p.y, p.z0], [p.x1, p.y, p.z1], [p.x0, p.y, p.z1], [cx, p.y + p.rise, cz]];
      const pos = [];
      for (const t of [[0, 4, 1], [1, 4, 2], [2, 4, 3], [3, 4, 0]]) for (const i of t) pos.push(...v[i]);
      g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      break;
    }
    case 'cyl':
      g = new THREE.CylinderGeometry(p.r, p.r, p.sh, p.seg);
      g.translate(p.x, p.sy + p.sh / 2, p.z);
      break;
    case 'sphere':
      g = new THREE.IcosahedronGeometry(p.r, 1);
      g.translate(p.x, p.y, p.z);
      break;
    default: // cone
      g = new THREE.ConeGeometry(p.r, p.h, p.seg);
      g.translate(p.x, p.y, p.z);
  }
  g.deleteAttribute('uv');
  const ng = g.index ? g.toNonIndexed() : g;
  const c = tmpColor.set(p.color);
  const n = ng.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r * p.jit; arr[i * 3 + 1] = c.g * p.jit; arr[i * 3 + 2] = c.b * p.jit;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return ng;
}

export class WorldView {
  constructor(scene, world, opts = {}) {
    this.scene = scene;
    this.world = world;
    this.detail = opts.detail || 'high';
    this.ranges = new Map(); // element id -> [[vertexStart, count]]
    this.shaking = [];
    this.hv = new Map(); // harvestable id -> [{pool, index, m}]
    this.signs = [];
    this.fxHooks = opts.fxHooks || {}; // {shatter(el, mode)}
    this.build();
  }

  build() {
    const { scene, world } = this;
    scene.add(buildTerrainMesh());
    this.water = buildWater();
    scene.add(this.water);
    addRoads(scene);

    // Merge every static primitive into one mesh, remembering which vertices
    // belong to which breakable chunk.
    const geos = [];
    let offset = 0;
    world.prims.forEach((p) => {
      const g = primGeometry(p);
      const n = g.attributes.position.count;
      if (p.el >= 0) {
        if (!this.ranges.has(p.el)) this.ranges.set(p.el, []);
        this.ranges.get(p.el).push([offset, n]);
      }
      offset += n;
      geos.push(g);
    });
    const merged = mergeGeometries(geos, false);
    merged.computeBoundingSphere();
    merged.attributes.position.setUsage(THREE.DynamicDrawUsage);
    merged.attributes.color.setUsage(THREE.DynamicDrawUsage);
    this.staticMesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.staticMesh.castShadow = true;
    this.staticMesh.receiveShadow = true;
    this.staticMesh.frustumCulled = false;
    scene.add(this.staticMesh);

    this.makePools();
    for (const h of world.harvestables) {
      const parts = h.parts.map((s) => {
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion(...s.q), new THREE.Vector3(s.sx, s.sy, s.sz),
        );
        const pool = this.pools[s.pool];
        return { pool, m, index: pool.add(m, s.color) };
      });
      this.hv.set(h.id, parts);
    }
    for (const p of Object.values(this.pools)) {
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
      p.mesh.computeBoundingSphere();
      scene.add(p.mesh);
    }

    this.signs = makeSignMeshes(scene, world);
    addGrassAndBushes(scene, world, this.detail);
    this.addClouds();
    this.sunSprite = this.makeSun();
    scene.add(this.sunSprite);

    this.weakSprite = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({ map: weakPointTexture(), transparent: true, depthTest: false }),
    );
    this.weakSprite.renderOrder = 10;
    this.weakSprite.visible = false;
    scene.add(this.weakSprite);
  }

  makePools() {
    const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
    const white = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.pools = {
      trunk: new Pool(new THREE.CylinderGeometry(0.28, 0.42, 1, 6).translate(0, 0.5, 0), lam('#8a5a2b'), 400),
      palmTrunk: new Pool(new THREE.CylinderGeometry(0.2, 0.3, 1, 7).translate(0, 0.5, 0), lam('#a07a4f'), 300),
      frond: new Pool(new THREE.ConeGeometry(0.6, 1, 4).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), 600, true),
      pine: new Pool(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), lam('#2f9e48'), 800),
      round: new Pool(new THREE.IcosahedronGeometry(1, 0), white, 900, true),
      rock: new Pool(new THREE.DodecahedronGeometry(1, 0), white, 200, true),
      body: new Pool(boxGeo, white, 120, true),
      cabin: new Pool(boxGeo, lam('#2c3e50'), 60),
      wheel: new Pool(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10).rotateZ(Math.PI / 2), lam('#1b1b1b'), 240),
      container: new Pool(boxGeo, white, 140, true),
      crate: new Pool(boxGeo, lam('#b37a3f'), 160),
    };
  }

  addClouds() {
    const R = mulberry32(31337);
    const rr = (a, b) => a + R() * (b - a);
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

  makeSun() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const rad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rad.addColorStop(0, 'rgba(255,255,240,1)');
    rad.addColorStop(0.25, 'rgba(255,250,215,1)');
    rad.addColorStop(0.4, 'rgba(255,240,180,0.5)');
    rad.addColorStop(1, 'rgba(255,230,160,0)');
    g.fillStyle = rad;
    g.fillRect(0, 0, 128, 128);
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false, depthWrite: false, transparent: true }));
    sun.scale.set(220, 220, 1);
    sun.renderOrder = -1;
    return sun;
  }

  // ------------------------------------------------------------ events

  tint(el, factor) {
    const ranges = this.ranges.get(el.id);
    if (!ranges) return;
    const attr = this.staticMesh.geometry.attributes.color;
    const c = tmpColor.set(el.hex);
    const r = c.r * el.jit * factor, g = c.g * el.jit * factor, b = c.b * el.jit * factor;
    for (const [start, count] of ranges) {
      for (let i = start; i < start + count; i++) {
        attr.array[i * 3] = r; attr.array[i * 3 + 1] = g; attr.array[i * 3 + 2] = b;
      }
      attr.addUpdateRange(start * 3, count * 3);
    }
    attr.needsUpdate = true;
  }

  breakStatic(el, mode) {
    const ranges = this.ranges.get(el.id);
    if (!ranges) return;
    const attr = this.staticMesh.geometry.attributes.position;
    for (const [start, count] of ranges) {
      attr.array.fill(0, start * 3, (start + count) * 3);
      attr.addUpdateRange(start * 3, count * 3);
    }
    attr.needsUpdate = true;
    for (const s of this.signs) if (s.board === el.id) s.meshes.forEach((m) => { m.visible = false; });
    if (this.fxHooks.shatter) this.fxHooks.shatter(el, mode);
  }

  hitHarvest(h) {
    h.shakeT = 0.25;
    if (!this.shaking.includes(h)) this.shaking.push(h);
  }

  breakHarvest(h) {
    for (const p of this.hv.get(h.id)) p.pool.set(p.index, ZERO);
  }

  handle(ev) {
    switch (ev.type) {
      case 'staticDamaged': this.tint(ev.el, ev.factor); break;
      case 'staticBroken': this.breakStatic(ev.el, ev.mode); break;
      case 'harvestHit': this.hitHarvest(ev.h); break;
      case 'harvestBroken': this.breakHarvest(ev.h); break;
      default:
    }
  }

  update(dt, time, focusHarvest) {
    for (let i = this.shaking.length - 1; i >= 0; i--) {
      const h = this.shaking[i];
      h.shakeT -= dt;
      if (h.dead) { this.shaking.splice(i, 1); continue; }
      const amp = Math.max(0, h.shakeT) * 0.35;
      for (const p of this.hv.get(h.id)) {
        m4.copy(p.m);
        m4.elements[12] += Math.sin(time * 70) * amp;
        m4.elements[14] += Math.cos(time * 63) * amp;
        p.pool.set(p.index, h.shakeT > 0 ? m4 : p.m);
      }
      if (h.shakeT <= 0) this.shaking.splice(i, 1);
    }
    this.water.userData.uniforms.uTime.value = time;
    this.clouds.position.x = (time * 1.5) % 200;
    // Weak point marker on whatever the player is harvesting.
    if (focusHarvest && focusHarvest.weak && !focusHarvest.dead) {
      const w = focusHarvest.weak;
      this.weakSprite.visible = true;
      this.weakSprite.position.set(w.pos.x, w.pos.y, w.pos.z);
      this.weakSprite.lookAt(w.pos.x + w.normal.x, w.pos.y + w.normal.y, w.pos.z + w.normal.z);
    } else {
      this.weakSprite.visible = false;
    }
  }
}
