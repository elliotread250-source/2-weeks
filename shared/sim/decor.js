// Set dressing that has gameplay weight: street lamps, rooftop units, fences,
// benches, barrels, sandbags, POI signs and palm trees. Everything here is
// breakable or harvestable, so it lives in the sim. Purely visual dressing
// (roads, grass, flowers, bushes) is in public/js/render/decor.js.
import { ROADS, POIS, terrainHeight, distToRoad, TERRAIN_SIZE } from './terrain.js';

function inPad(x, z, extra = 0) {
  return POIS.some((p) => Math.hypot(x - p.x, z - p.z) < p.pad + extra);
}


// ------------------------------------------------------------------ static

export function addStaticDetail(world) {
  const sb = world.sb;
  const R = world.R2;
  const rr = (a, b) => a + R() * (b - a);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
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
  // The renderer draws the lettering on the board and hides it when it breaks.
  world.signs.push({ name, x, z, y0, W, H, T, axis: faceAxis, board: sb.elements[sb.elements.length - 1].id });
}

function scatter(R, count, accept) {
  const rr = (a, b) => a + R() * (b - a);
  const out = [];
  for (let tries = 0; tries < count * 6 && out.length < count; tries++) {
    const x = rr(-TERRAIN_SIZE / 2 + 15, TERRAIN_SIZE / 2 - 15), z = rr(-TERRAIN_SIZE / 2 + 15, TERRAIN_SIZE / 2 - 15);
    const h = terrainHeight(x, z);
    if (accept(x, z, h)) out.push([x, h, z]);
  }
  return out;
}

// Palm trees along the beaches. Harvestable wood like any other tree.
export function addPalms(world) {
  const spots = scatter(world.R2, 45, (x, z, h) => h > 1.2 && h < 2.6 && !inPad(x, z, 3) && distToRoad(x, z) > 4 && world.free(x, z, 1, 1));
  for (const [x, , z] of spots) world.palm(x, z);
}
