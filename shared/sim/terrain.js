// Island terrain heightmap, POIs and roads. Pure data: the renderer builds the
// mesh from `heights`, and the server uses the same grid for collision.
import { fbm, smoothstep, lerp, clamp, valueNoise } from '../math/util.js';
import { WATER_LEVEL } from '../config.js';

export const TERRAIN_SIZE = 560;
export const RES = 280; // segments per side
export const STEP = TERRAIN_SIZE / RES;

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

// Roads linking POIs, like Rebirth's service roads. Each runs from pad edge
// to pad edge.
const ROAD_LINKS = [
  ['prison', 'control'], ['prison', 'security'], ['prison', 'construction'], ['prison', 'chem'],
  ['construction', 'hq'], ['hq', 'decon'], ['decon', 'bio'], ['bio', 'security'],
  ['chem', 'factory'], ['factory', 'harbor'], ['harbor', 'shore'], ['shore', 'living'],
  ['living', 'construction'], ['control', 'living'], ['control', 'factory'],
];

export const ROADS = ROAD_LINKS.map(([a, b]) => {
  const A = POIS.find((p) => p.id === a), B = POIS.find((p) => p.id === b);
  const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  const ia = Math.min(len * 0.4, A.pad * 0.75), ib = Math.min(len * 0.4, B.pad * 0.75);
  return { x0: A.x + ux * ia, z0: A.z + uz * ia, x1: B.x - ux * ib, z1: B.z - uz * ib, a, b };
});

export function distToRoad(x, z) {
  let best = Infinity;
  for (const r of ROADS) {
    const dx = r.x1 - r.x0, dz = r.z1 - r.z0;
    const t = Math.max(0, Math.min(1, ((x - r.x0) * dx + (z - r.z0) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - (r.x0 + dx * t), z - (r.z0 + dz * t));
    if (d < best) best = d;
  }
  return best;
}

// Hex colours; the renderer turns these into THREE.Color.
export const GROUND_COLORS = {
  concrete: '#b9b4a8',
  asphalt: '#6f7378',
  grass: '#62c94b',
  sand: '#f1d891',
  dirt: '#b98a52',
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
export const heights = new Float32Array((RES + 1) * (RES + 1));
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

