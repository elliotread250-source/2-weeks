// Visual-only dressing: road ribbons, POI sign boards, instanced grass, flowers
// and bushes. Nothing here affects gameplay, so it is allowed to differ between
// clients (graphics settings change how much grass there is).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '/shared/math/util.js';
import { DECOR_SEED } from '/shared/config.js';
import { ROADS, POIS, terrainHeight, distToRoad, TERRAIN_SIZE, biomeAt } from '/shared/sim/terrain.js';

function inPad(x, z, extra = 0) {
  return POIS.some((p) => Math.hypot(x - p.x, z - p.z) < p.pad + extra);
}

function slopeAt(x, z) {
  return Math.abs(terrainHeight(x + 1, z) - terrainHeight(x - 1, z)) + Math.abs(terrainHeight(x, z + 1) - terrainHeight(x, z - 1));
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

// Sign boards the sim placed. Returns [{board, meshes}] so the world view can
// hide the lettering when its board breaks.
export function makeSignMeshes(scene, world) {
  return world.signs.map((s) => {
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(s.name), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.W - 0.04, s.H - 0.04), mat);
    mesh.position.set(s.x, s.y0 + s.H / 2, s.z);
    if (s.axis === 'x') mesh.rotation.y = Math.PI / 2;
    // Two faces, nudged just off the board so they don't flicker.
    const back = mesh.clone();
    if (s.axis === 'x') { mesh.position.x += s.T / 2 + 0.01; back.position.x -= s.T / 2 + 0.01; }
    else { mesh.position.z += s.T / 2 + 0.01; back.position.z -= s.T / 2 + 0.01; }
    back.rotation.y += Math.PI;
    scene.add(mesh, back);
    return { board: s.board, meshes: [mesh, back] };
  });
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

export function addRoads(scene) {
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

export function addGrassAndBushes(scene, world, detail) {
  const R = mulberry32(DECOR_SEED + 1);
  const rr = (a, b) => a + R() * (b - a);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const scatter = (count, accept) => {
    const out = [];
    for (let tries = 0; tries < count * 6 && out.length < count; tries++) {
      const x = rr(-TERRAIN_SIZE / 2 + 15, TERRAIN_SIZE / 2 - 15), z = rr(-TERRAIN_SIZE / 2 + 15, TERRAIN_SIZE / 2 - 15);
      const h = terrainHeight(x, z);
      if (accept(x, z, h)) out.push([x, h, z]);
    }
    return out;
  };
  const low = detail === 'low';
  const onGrass = (x, z, h) => h > 2.6 && biomeAt(x, z) !== 'snow' && biomeAt(x, z) !== 'desert' && !inPad(x, z, 2) && distToRoad(x, z) > 4.2 && slopeAt(x, z) < 2.4;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const color = new THREE.Color();

  // Grass tufts, clustered so the meadows look patchy rather than uniform.
  const tufts = [];
  const centres = scatter(low ? 560 : 1500, onGrass);
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
  const fl = scatter(low ? 1100 : 3900, onGrass);
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshLambertMaterial({ color: '#ffffff' }), fl.length);
  fl.forEach(([x, h, z], i) => {
    m4.compose(v.set(x, h + 0.3, z), q.identity(), s.set(1, 0.7, 1));
    flowers.setMatrixAt(i, m4);
    flowers.setColorAt(i, color.set(pick(['#ff6b6b', '#ffd93d', '#ffffff', '#c77dff', '#ff9ff3', '#ffa94d'])));
  });
  scene.add(flowers);

  // Bushes (walk-through, like Fortnite's).
  const bu = scatter(low ? 300 : 830, (x, z, h) => h > 2.4 && !inPad(x, z, -4) && distToRoad(x, z) > 4 && slopeAt(x, z) < 3 && world.free(x, z, 0.6, 0.6, 0));
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
}
