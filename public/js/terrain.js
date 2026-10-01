// Island terrain. Shape and landmarks follow Rebirth Island (prison on the
// central hill, industrial north, harbour south-west, beach to the south),
// painted with Fortnite's saturated greens and sandy beaches.
import * as THREE from 'three';
import { fbm, smoothstep, lerp, clamp } from './util.js';
import { WATER_LEVEL } from './config.js';

export const TERRAIN_SIZE = 560;
const RES = 280; // segments per side
const STEP = TERRAIN_SIZE / RES;

// Points of interest. Rebirth Island names on the left, Fortnite-style
// alliterative names in game. `pad` is the flattened radius and `ground`
// tints the flattened area.
export const POIS = [
  { id: 'prison', name: 'Prison Peaks', rebirth: 'Prison Block', x: 0, z: -15, pad: 52, height: 30, ground: 'concrete' },
  { id: 'control', name: 'Control Corner', rebirth: 'Control Center', x: -18, z: 62, pad: 24, height: 19, ground: 'concrete' },
  { id: 'bio', name: 'Bio Bluffs', rebirth: 'Bioweapons Labs', x: 95, z: -100, pad: 26, height: 12, ground: 'concrete' },
  { id: 'chem', name: 'Chem Cove', rebirth: 'Chemical Engineering', x: -98, z: -92, pad: 26, height: 11, ground: 'concrete' },
  { id: 'factory', name: 'Factory Flats', rebirth: 'Factory (Industry)', x: -140, z: 5, pad: 30, height: 8, ground: 'asphalt' },
  { id: 'harbor', name: 'Hazy Harbor', rebirth: 'Harbor', x: -105, z: 128, pad: 26, height: 2.2, ground: 'asphalt' },
  { id: 'living', name: 'Lazy Lanes', rebirth: 'Living Quarters', x: 62, z: 118, pad: 30, height: 7, ground: 'grass' },
  { id: 'hq', name: 'HQ Heights', rebirth: 'Headquarters', x: 152, z: 38, pad: 24, height: 6, ground: 'concrete' },
  { id: 'decon', name: 'Decon Docks', rebirth: 'Decon Zone', x: 150, z: -52, pad: 22, height: 5, ground: 'asphalt' },
  { id: 'shore', name: 'Salty Shore', rebirth: 'Shore', x: -10, z: 172, pad: 20, height: 1.6, ground: 'sand' },
  { id: 'security', name: 'Security Sands', rebirth: 'Security Area', x: 10, z: -158, pad: 20, height: 4, ground: 'asphalt' },
  { id: 'construction', name: 'Crane Corner', rebirth: 'Construction Site', x: 88, z: 30, pad: 22, height: 13, ground: 'dirt' },
];

const GROUND_COLORS = {
  concrete: new THREE.Color('#b9b4a8'),
  asphalt: new THREE.Color('#6f7378'),
  grass: new THREE.Color('#62c94b'),
  sand: new THREE.Color('#f1d891'),
  dirt: new THREE.Color('#b98a52'),
};

function baseHeight(x, z) {
  // Rebirth is longer east-west than north-south with a rocky north coast.
  const nx = x / 205, nz = z / 190;
  const warp = fbm(x * 0.008 + 11, z * 0.008 - 7, 3) * 0.18;
  const d = Math.sqrt(nx * nx + nz * nz) + warp;
  const land = (0.97 - d) * 30;
  const hills = fbm(x * 0.02, z * 0.02, 4) * 6 * smoothstep(0.95, 0.6, d);
  const ridge = Math.max(0, fbm(x * 0.01 + 50, z * 0.01, 2)) * 8 * smoothstep(0.9, 0.5, d);
  return Math.max(-9, land + hills + ridge);
}

function rawHeight(x, z) {
  let h = baseHeight(x, z);
  for (const p of POIS) {
    const dx = x - p.x, dz = z - p.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const t = smoothstep(p.pad + 22, p.pad, dist);
    if (t > 0) h = lerp(h, p.height, t);
  }
  return h;
}

// Pre-baked height grid. Physics and rendering both sample the same grid so
// characters never float or sink.
const heights = new Float32Array((RES + 1) * (RES + 1));
for (let iz = 0; iz <= RES; iz++) {
  for (let ix = 0; ix <= RES; ix++) {
    const x = -TERRAIN_SIZE / 2 + ix * STEP;
    const z = -TERRAIN_SIZE / 2 + iz * STEP;
    heights[iz * (RES + 1) + ix] = rawHeight(x, z);
  }
}

export function terrainHeight(x, z) {
  const fx = clamp((x + TERRAIN_SIZE / 2) / STEP, 0, RES - 0.0001);
  const fz = clamp((z + TERRAIN_SIZE / 2) / STEP, 0, RES - 0.0001);
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const i = iz * (RES + 1) + ix;
  // Match the triangle split PlaneGeometry uses so we agree with the mesh.
  const h00 = heights[i], h10 = heights[i + 1];
  const h01 = heights[i + RES + 1], h11 = heights[i + RES + 2];
  if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
  return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
}

export function isLand(x, z) {
  return terrainHeight(x, z) > WATER_LEVEL + 0.6;
}

export function poiAt(x, z) {
  let best = null, bd = Infinity;
  for (const p of POIS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.pad + 20 && d < bd) { bd = d; best = p; }
  }
  return best;
}

export function buildTerrainMesh() {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, RES, RES);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color('#f3dc95');
  const wetSand = new THREE.Color('#d9bd73');
  const grassA = new THREE.Color('#5ccc46');
  const grassB = new THREE.Color('#3fae3a');
  const rock = new THREE.Color('#9a9488');
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const ix = Math.round((x + TERRAIN_SIZE / 2) / STEP);
    const iz = Math.round((z + TERRAIN_SIZE / 2) / STEP);
    const h = heights[iz * (RES + 1) + ix];
    pos.setY(i, h);

    const hx = heights[iz * (RES + 1) + Math.min(RES, ix + 1)] - heights[iz * (RES + 1) + Math.max(0, ix - 1)];
    const hz = heights[Math.min(RES, iz + 1) * (RES + 1) + ix] - heights[Math.max(0, iz - 1) * (RES + 1) + ix];
    const slope = Math.sqrt(hx * hx + hz * hz) / (2 * STEP);

    const n = fbm(x * 0.05, z * 0.05, 2) * 0.5 + 0.5;
    c.copy(grassA).lerp(grassB, n);
    if (h < 2.2) c.copy(sand).lerp(c, smoothstep(1.2, 2.2, h));
    if (h < 0.3) c.copy(wetSand);
    c.lerp(rock, smoothstep(0.55, 0.95, slope));

    for (const p of POIS) {
      const d = Math.hypot(x - p.x, z - p.z);
      const t = smoothstep(p.pad + 6, p.pad - 4, d);
      if (t > 0) c.lerp(GROUND_COLORS[p.ground], t * 0.92);
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildWater() {
  const geo = new THREE.PlaneGeometry(2400, 2400, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshPhongMaterial({
    color: '#2fb6e8', transparent: true, opacity: 0.82, shininess: 90, specular: '#bff2ff',
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER_LEVEL;
  mesh.receiveShadow = true;

  // Shallow-water foam ring drawn as a slightly lighter disc under the surface.
  return mesh;
}

// Paint the minimap once from the height grid.
export function paintMinimap(canvas) {
  const size = canvas.width;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px / size - 0.5) * TERRAIN_SIZE;
      const z = (py / size - 0.5) * TERRAIN_SIZE;
      const h = terrainHeight(x, z);
      let r, g, b;
      if (h < WATER_LEVEL) {
        const deep = clamp(-h / 9, 0, 1);
        r = lerp(70, 20, deep); g = lerp(200, 120, deep); b = lerp(235, 200, deep);
      } else if (h < 2) {
        r = 240; g = 218; b = 150;
      } else {
        const shade = clamp(h / 40, 0, 1);
        r = lerp(95, 70, shade); g = lerp(200, 150, shade); b = lerp(75, 60, shade);
      }
      const poi = poiAt(x, z);
      if (poi && Math.hypot(x - poi.x, z - poi.z) < poi.pad - 2 && h >= WATER_LEVEL) {
        const gc = GROUND_COLORS[poi.ground];
        r = lerp(r, gc.r * 255, 0.6); g = lerp(g, gc.g * 255, 0.6); b = lerp(b, gc.b * 255, 0.6);
      }
      const i = (py * size + px) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
