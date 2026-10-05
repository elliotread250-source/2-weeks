// Set dressing that makes the island feel lived-in: roads, street lamps, POI
// signs, rooftop units, fences, benches, barrels, sandbags, palm trees, and
// instanced grass, flowers and bushes. Breakable props go through the world's
// StaticBuilder so they shatter like everything else.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROADS, POIS, terrainHeight, distToRoad, TERRAIN_SIZE } from './terrain.js';
import { mulberry32 } from './util.js';

const R = mulberry32(777);
const rr = (a, b) => a + R() * (b - a);
const pick = (arr) => arr[Math.floor(R() * arr.length)];

function inPad(x, z, extra = 0) {
  return POIS.some((p) => Math.hypot(x - p.x, z - p.z) < p.pad + extra);
}

function slopeAt(x, z) {
  return Math.abs(terrainHeight(x + 1, z) - terrainHeight(x - 1, z)) + Math.abs(terrainHeight(x, z + 1) - terrainHeight(x, z - 1));
}

// ------------------------------------------------------------------ static

export function addStaticDetail(world, detail) {
  const sb = world.sb;
  const prevMat = sb.mat;

  // Street lamps along the roads.
  sb.mat = 'metal';
  for (const r of ROADS) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const ux = (r.x1 - r.x0) / len, uz = (r.z1 - r.z0) / len;
    const nx = -uz, nz = ux;
    let side = 1;
    for (let t = 10; t < len - 6; t += 34) {
      const x = r.x0 + ux * t + nx * 4.8 * side, z = r.z0 + uz * t + nz * 4.8 * side;
      const g = terrainHeight(x, z);
      if (g < 1 || inPad(x, z, 2) || !world.free(x, z, 0.4, 0.4)) { side = -side; continue; }
      sb.cylinder(x, g - 0.3, z, 0.11, 6.3, '#4a5560', true, 8);
      const ax = x - nx * side * 1.4, az = z - nz * side * 1.4;
      sb.box(Math.min(x, ax) - 0.07, g + 5.85, Math.min(z, az) - 0.07, Math.max(x, ax) + 0.07, g + 6.0, Math.max(z, az) + 0.07, '#4a5560');
      sb.box(ax - 0.28, g + 5.55, az - 0.28, ax + 0.28, g + 5.85, az + 0.28, '#fff1b8');
      side = -side;
    }
  }

  // Rooftop details on every building.
  for (const b of world.buildings) {
    if (!b.walls) continue;
    if (b.pitched) {
      sb.mat = 'brick';
      const cx = b.x + b.w / 4, cz = b.z - b.d / 6;
      sb.box(cx - 0.45, b.top - 0.3, cz - 0.45, cx + 0.45, b.top + 3.6, cz + 0.45, '#8e4b3a');
      sb.box(cx - 0.55, b.top + 3.6, cz - 0.55, cx + 0.55, b.top + 3.85, cz + 0.55, '#5e3226');
      continue;
    }
    sb.mat = 'metal';
    const units = Math.max(1, Math.round((b.w * b.d) / 160));
    for (let i = 0; i < units; i++) {
      const cx = b.x + rr(-b.w / 2 + 3.6, b.w / 2 - 3.6) * 0.8;
      const cz = b.z + rr(-b.d / 2 + 2.2, b.d / 2 - 2.2) * 0.4 + b.d * 0.22;
      sb.box(cx - 0.8, b.top, cz - 0.6, cx + 0.8, b.top + 1.1, cz + 0.6, '#c9ced3');
      sb.box(cx - 0.6, b.top + 1.1, cz - 0.45, cx + 0.6, b.top + 1.18, cz + 0.45, '#5b636b');
    }
    if (b.w > 12) {
      sb.cylinder(b.x - b.w / 4, b.top, b.z - b.d / 4, 0.16, 1.0, '#9aa3ab', true, 8);
      sb.cylinder(b.x + b.w / 5, b.top, b.z - b.d / 4, 0.16, 0.8, '#9aa3ab', true, 8);
    }
  }

  // Lazy Lanes: picket fences, mailboxes, benches.
  sb.mat = 'wood';
  for (const b of world.buildings.filter((q) => q.poi === 'living')) {
    const front = b.doors.includes('s') ? 1 : -1;
    const fz = b.z + front * (b.d / 2 + 3);
    const g = terrainHeight(b.x, fz);
    const x0 = b.x - b.w / 2 - 0.5, x1 = b.x + b.w / 2 + 0.5;
    for (let x = x0; x <= x1 + 0.01; x += 1.0) {
      if (Math.abs(x - b.x) < 1.4) continue; // gate
      sb.box(x - 0.06, g, fz - 0.06, x + 0.06, g + 1.0, fz + 0.06, '#f7f3ea');
    }
    sb.box(x0, g + 0.35, fz - 0.04, b.x - 1.4, g + 0.47, fz + 0.04, '#f7f3ea');
    sb.box(b.x + 1.4, g + 0.35, fz - 0.04, x1, g + 0.47, fz + 0.04, '#f7f3ea');
    sb.box(x0, g + 0.72, fz - 0.04, b.x - 1.4, g + 0.84, fz + 0.04, '#f7f3ea');
    sb.box(b.x + 1.4, g + 0.72, fz - 0.04, x1, g + 0.84, fz + 0.04, '#f7f3ea');
    // Mailbox by the gate.
    sb.mat = 'metal';
    sb.box(b.x + 1.9, g, fz + front * 0.6 - 0.05, b.x + 2.0, g + 1.05, fz + front * 0.6 + 0.05, '#6d4c41');
    sb.box(b.x + 1.75, g + 1.05, fz + front * 0.6 - 0.22, b.x + 2.15, g + 1.35, fz + front * 0.6 + 0.22, pick(['#2e86de', '#e74c3c', '#27ae60', '#34495e']));
    sb.mat = 'wood';
  }

  const bench = (x, z, alongX) => {
    const g = terrainHeight(x, z);
    const [hw, hd] = alongX ? [0.9, 0.25] : [0.25, 0.9];
    sb.box(x - hw, g + 0.42, z - hd, x + hw, g + 0.52, z + hd, '#a0703f');
    if (alongX) sb.box(x - hw, g + 0.52, z + hd - 0.06, x + hw, g + 0.95, z + hd, '#a0703f');
    else sb.box(x + hw - 0.06, g + 0.52, z - hd, x + hw, g + 0.95, z + hd, '#a0703f');
    sb.box(x - hw + 0.05, g, z - hd + 0.05, x - hw + 0.15, g + 0.42, z + hd - 0.05, '#3d3d3d');
    sb.box(x + hw - 0.15, g, z - hd + 0.05, x + hw - 0.05, g + 0.42, z + hd - 0.05, '#3d3d3d');
  };
  for (const id of ['living', 'shore', 'control', 'hq', 'prison']) {
    const p = POIS.find((q) => q.id === id);
    for (let i = 0; i < 4; i++) {
      const x = p.x + rr(-p.pad * 0.7, p.pad * 0.7), z = p.z + rr(-p.pad * 0.7, p.pad * 0.7);
      if (world.free(x, z, 1.2, 1.2)) bench(x, z, R() < 0.5);
    }
  }

  // Barrels at the industrial POIs.
  sb.mat = 'metal';
  for (const id of ['factory', 'harbor', 'decon', 'chem', 'construction']) {
    const p = POIS.find((q) => q.id === id);
    for (let c = 0; c < 3; c++) {
      const cx = p.x + rr(-p.pad * 0.8, p.pad * 0.8), cz = p.z + rr(-p.pad * 0.8, p.pad * 0.8);
      const col = pick(['#c0392b', '#2e86de', '#f1c40f', '#27ae60']);
      for (let i = 0; i < 4; i++) {
        const x = cx + rr(-1.4, 1.4), z = cz + rr(-1.4, 1.4);
        if (!world.free(x, z, 0.5, 0.5, 0.05)) continue;
        const g = terrainHeight(x, z);
        sb.cylinder(x, g, z, 0.42, 1.15, col, true, 10);
        sb.cylinder(x, g + 1.15, z, 0.36, 0.05, '#2d3436', true, 10);
      }
    }
  }

  // Sandbag walls at Decon Docks and Security Sands.
  sb.mat = 'brick';
  for (const id of ['decon', 'security', 'prison']) {
    const p = POIS.find((q) => q.id === id);
    for (let i = 0; i < 5; i++) {
      const x = p.x + rr(-p.pad * 0.8, p.pad * 0.8), z = p.z + rr(-p.pad * 0.8, p.pad * 0.8);
      const alongX = R() < 0.5;
      const [hw, hd] = alongX ? [2.2, 0.45] : [0.45, 2.2];
      if (!world.free(x, z, hw, hd)) continue;
      const g = terrainHeight(x, z);
      sb.box(x - hw, g, z - hd, x + hw, g + 0.45, z + hd, '#c8b58a');
      sb.box(x - hw + 0.15, g + 0.45, z - hd + 0.05, x + hw - 0.15, g + 0.9, z + hd - 0.05, '#bba776');
    }
  }

  // POI name signs at the end of each road.
  sb.mat = 'wood';
  const signed = new Set();
  for (const r of ROADS) {
    for (const [id, x, z, dx, dz] of [[r.a, r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0], [r.b, r.x1, r.z1, r.x0 - r.x1, r.z0 - r.z1]]) {
      if (signed.has(id)) continue;
      const len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
      const sx = x + ux * 4 - uz * 5.5, sz = z + uz * 4 + ux * 5.5;
      if (terrainHeight(sx, sz) < 1 || !world.free(sx, sz, 1.4, 1.4)) continue;
      signed.add(id);
      makeSign(world, POIS.find((p) => p.id === id).name, sx, sz, Math.abs(ux) > Math.abs(uz) ? 'x' : 'z');
    }
  }

  sb.mat = prevMat;
}

function signTexture(name) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, '#2b5cd6');
  grad.addColorStop(1, '#183a96');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 160);
  g.lineWidth = 12;
  g.strokeStyle = '#ffe94a';
  g.strokeRect(6, 6, 500, 148);
  g.font = 'bold 64px "Luckiest Guy", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillText(name.toUpperCase(), 260, 88);
  g.fillStyle = '#ffe94a';
  g.fillText(name.toUpperCase(), 256, 84, 470);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSign(world, name, x, z, faceAxis) {
  const sb = world.sb;
  const g = terrainHeight(x, z);
  const W = 2.5, H = 0.8, T = 0.12, y0 = g + 1.7;
  // Posts.
  if (faceAxis === 'x') {
    sb.box(x - 0.08, g, z - W / 2 + 0.1, x + 0.08, y0 + H, z - W / 2 + 0.26, '#6d4c41');
    sb.box(x - 0.08, g, z + W / 2 - 0.26, x + 0.08, y0 + H, z + W / 2 - 0.1, '#6d4c41');
    sb.box(x - T / 2, y0, z - W / 2, x + T / 2, y0 + H, z + W / 2, '#183a96');
  } else {
    sb.box(x - W / 2 + 0.1, g, z - 0.08, x - W / 2 + 0.26, y0 + H, z + 0.08, '#6d4c41');
    sb.box(x + W / 2 - 0.26, g, z - 0.08, x + W / 2 - 0.1, y0 + H, z + 0.08, '#6d4c41');
    sb.box(x - W / 2, y0, z - T / 2, x + W / 2, y0 + H, z + T / 2, '#183a96');
  }
  const board = sb.elements[sb.elements.length - 1];
  const mat = new THREE.MeshBasicMaterial({ map: signTexture(name), side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, H - 0.04), mat);
  mesh.position.set(x, y0 + H / 2, z);
  if (faceAxis === 'x') mesh.rotation.y = Math.PI / 2;
  // Two faces, nudged just off the board so they don't flicker.
  const back = mesh.clone();
  if (faceAxis === 'x') { mesh.position.x += T / 2 + 0.01; back.position.x -= T / 2 + 0.01; }
  else { mesh.position.z += T / 2 + 0.01; back.position.z -= T / 2 + 0.01; }
  back.rotation.y += Math.PI;
  world.scene.add(mesh, back);
  board.onDestroy = () => { mesh.visible = false; back.visible = false; };
}

// ------------------------------------------------------------------ roads

function strip(points, half, offset, y) {
  // Ribbon following the polyline, draped on the terrain.
  const pos = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
    const nx = -dz / l, nz = dx / l;
    const corners = [
      [a.x + nx * (offset - half), a.z + nz * (offset - half)], [a.x + nx * (offset + half), a.z + nz * (offset + half)],
      [b.x + nx * (offset - half), b.z + nz * (offset - half)], [b.x + nx * (offset + half), b.z + nz * (offset + half)],
    ].map(([x, z]) => [x, Math.max(0.35, terrainHeight(x, z)) + y, z]);
    pos.push(...corners[0], ...corners[2], ...corners[1], ...corners[1], ...corners[2], ...corners[3]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function buildRoads(scene) {
  const asphalt = [], lines = [], dashes = [];
  for (const r of ROADS) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const n = Math.ceil(len / 2);
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push({ x: r.x0 + ((r.x1 - r.x0) * i) / n, z: r.z0 + ((r.z1 - r.z0) * i) / n });
    asphalt.push(strip(pts, 3.4, 0, 0.08));
    lines.push(strip(pts, 0.1, 3.0, 0.1), strip(pts, 0.1, -3.0, 0.1));
    for (let i = 0; i < pts.length - 2; i += 3) dashes.push(strip([pts[i], pts[i + 1]], 0.1, 0, 0.1));
  }
  const mk = (geos, color) => {
    const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true;
    scene.add(m);
  };
  mk(asphalt, '#5f6469');
  mk(lines, '#f2f2f2');
  mk(dashes, '#ffd23f');
}

// ------------------------------------------------------------------ foliage

function grassGeometry() {
  const blades = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.BufferGeometry();
    const lean = 0.12;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.09, 0, 0, 0.09, 0, 0, lean, 0.6, 0.02], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.55, 0.7, 0.5, 0.55, 0.7, 0.5, 1.15, 1.2, 1.0], 3));
    g.rotateY((i * Math.PI * 2) / 3 + 0.3);
    g.translate(Math.cos(i * 2.1) * 0.08, 0, Math.sin(i * 2.1) * 0.08);
    blades.push(g);
  }
  const m = mergeGeometries(blades);
  m.computeVertexNormals();
  return m;
}

function scatter(count, accept) {
  const out = [];
  for (let tries = 0; tries < count * 6 && out.length < count; tries++) {
    const x = rr(-TERRAIN_SIZE / 2 + 15, TERRAIN_SIZE / 2 - 15), z = rr(-TERRAIN_SIZE / 2 + 15, TERRAIN_SIZE / 2 - 15);
    const h = terrainHeight(x, z);
    if (accept(x, z, h)) out.push([x, h, z]);
  }
  return out;
}

export function addInstancedDetail(world, detail) {
  const scene = world.scene;
  buildRoads(scene);
  const low = detail === 'low';
  const onGrass = (x, z, h) => h > 2.6 && !inPad(x, z, 2) && distToRoad(x, z) > 4.2 && slopeAt(x, z) < 2.4;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const color = new THREE.Color();

  // Grass tufts, clustered so the meadows look patchy rather than uniform.
  const tufts = [];
  const centres = scatter(low ? 260 : 700, onGrass);
  for (const [cx, , cz] of centres) {
    const n = low ? 8 : 18;
    for (let i = 0; i < n; i++) {
      const x = cx + rr(-4, 4), z = cz + rr(-4, 4);
      const h = terrainHeight(x, z);
      if (onGrass(x, z, h)) tufts.push([x, h, z]);
    }
  }
  const grass = new THREE.InstancedMesh(grassGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), tufts.length);
  tufts.forEach(([x, h, z], i) => {
    e.set(0, rr(0, Math.PI * 2), 0);
    q.setFromEuler(e);
    const k = rr(0.7, 1.5);
    m4.compose(v.set(x, h - 0.05, z), q, s.set(k, k * rr(0.8, 1.3), k));
    grass.setMatrixAt(i, m4);
    grass.setColorAt(i, color.set(pick(['#4fbf3f', '#5fcf45', '#3fae3a', '#7ad64d'])));
  });
  grass.receiveShadow = true;
  scene.add(grass);

  // Flowers.
  const fl = scatter(low ? 500 : 1800, onGrass);
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshLambertMaterial({ color: '#ffffff' }), fl.length);
  fl.forEach(([x, h, z], i) => {
    m4.compose(v.set(x, h + 0.3, z), q.identity(), s.set(1, 0.7, 1));
    flowers.setMatrixAt(i, m4);
    flowers.setColorAt(i, color.set(pick(['#ff6b6b', '#ffd93d', '#ffffff', '#c77dff', '#ff9ff3', '#ffa94d'])));
  });
  scene.add(flowers);

  // Bushes (walk-through, like Fortnite's).
  const bu = scatter(low ? 140 : 380, (x, z, h) => h > 2.4 && !inPad(x, z, -4) && distToRoad(x, z) > 4 && slopeAt(x, z) < 3 && world.free(x, z, 0.6, 0.6, 0));
  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), bu.length * 2);
  let bi = 0;
  bu.forEach(([x, h, z]) => {
    const k = rr(0.7, 1.3);
    const col = pick(['#2f9e48', '#3aa84a', '#2a8c3f', '#4cb84a']);
    for (let j = 0; j < 2; j++) {
      e.set(0, rr(0, 6), 0);
      q.setFromEuler(e);
      m4.compose(v.set(x + (j ? rr(-0.6, 0.6) : 0), h + 0.35 * k, z + (j ? rr(-0.6, 0.6) : 0)), q, s.set(k * rr(0.8, 1.1), k * 0.75, k * rr(0.8, 1.1)));
      bushes.setMatrixAt(bi, m4);
      bushes.setColorAt(bi, color.set(col).multiplyScalar(j ? 1.1 : 1));
      bi++;
    }
  });
  bushes.castShadow = true;
  bushes.receiveShadow = true;
  scene.add(bushes);

  // Sun disc.
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
  scene.add(sun);
  world.sunSprite = sun;
}

// Palm trees along the beaches. Harvestable wood like any other tree.
export function addPalms(world, detail) {
  const spots = scatter(detail === 'low' ? 25 : 45, (x, z, h) => h > 1.2 && h < 2.6 && !inPad(x, z, 3) && distToRoad(x, z) > 4 && world.free(x, z, 1, 1));
  for (const [x, , z] of spots) world.palm(x, z);
}
