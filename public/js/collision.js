// Collision world: a 2D spatial hash of axis-aligned boxes plus "slope"
// colliders (ramps and cones) that expose a height function. Everything the
// game needs (walking, bullets, line of sight, camera) runs through here so
// player builds, world buildings and harvestables all behave the same way.
import { PLAYER, WATER_LEVEL, WORLD_HALF } from './config.js';

const CELL = 8;
let nextId = 1;
let stampCounter = 1;

export function makeBox(minx, miny, minz, maxx, maxy, maxz, kind, owner) {
  return {
    id: nextId++, shape: 'box', kind, owner,
    min: { x: minx, y: miny, z: minz },
    max: { x: maxx, y: maxy, z: maxz },
    cells: null, stamp: 0,
  };
}

export function makeSlope(minx, miny, minz, maxx, maxy, maxz, heightAt, kind, owner) {
  const c = makeBox(minx, miny, minz, maxx, maxy, maxz, kind, owner);
  c.shape = 'slope';
  c.heightAt = heightAt;
  return c;
}

export class CollisionWorld {
  constructor(terrainHeight) {
    this.terrainHeight = terrainHeight;
    this.cells = new Map();
  }

  key(ix, iz) {
    return ix * 100003 + iz;
  }

  add(c) {
    c.cells = [];
    const x0 = Math.floor(c.min.x / CELL), x1 = Math.floor(c.max.x / CELL);
    const z0 = Math.floor(c.min.z / CELL), z1 = Math.floor(c.max.z / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this.key(ix, iz);
        let arr = this.cells.get(k);
        if (!arr) this.cells.set(k, (arr = []));
        arr.push(c);
        c.cells.push(k);
      }
    }
    return c;
  }

  remove(c) {
    if (!c.cells) return;
    for (const k of c.cells) {
      const arr = this.cells.get(k);
      if (!arr) continue;
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
    }
    c.cells = null;
  }

  query(minx, minz, maxx, maxz, out = []) {
    const stamp = ++stampCounter;
    const x0 = Math.floor(minx / CELL), x1 = Math.floor(maxx / CELL);
    const z0 = Math.floor(minz / CELL), z1 = Math.floor(maxz / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const arr = this.cells.get(this.key(ix, iz));
        if (!arr) continue;
        for (const c of arr) {
          if (c.stamp === stamp) continue;
          c.stamp = stamp;
          if (c.max.x < minx || c.min.x > maxx || c.max.z < minz || c.min.z > maxz) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  // Highest walkable surface at (x,z) that is at or below maxY.
  groundHeight(x, z, maxY, radius = 0.3) {
    let h = this.terrainHeight(x, z);
    const list = this.query(x - radius, z - radius, x + radius, z + radius, scratch);
    for (const c of list) {
      if (c.shape === 'box') {
        if (c.max.y > maxY || c.max.y <= h) continue;
        const cx = Math.max(c.min.x, Math.min(x, c.max.x));
        const cz = Math.max(c.min.z, Math.min(z, c.max.z));
        const dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz <= radius * radius) h = c.max.y;
      } else {
        if (x < c.min.x || x > c.max.x || z < c.min.z || z > c.max.z) continue;
        const sh = c.heightAt(x, z);
        if (sh !== null && sh <= maxY && sh > h) h = sh;
      }
    }
    scratch.length = 0;
    return h;
  }

  // Walk a body (feet position, velocity) through the world for one step.
  moveBody(body, dt) {
    const r = body.radius ?? PLAYER.radius;
    const height = body.height ?? PLAYER.height;
    const step = PLAYER.stepHeight;
    const p = body.pos;

    p.x += body.vel.x * dt;
    p.z += body.vel.z * dt;

    for (let iter = 0; iter < 2; iter++) {
      const list = this.query(p.x - r - 0.1, p.z - r - 0.1, p.x + r + 0.1, p.z + r + 0.1, scratch);
      for (const c of list) {
        if (c.shape !== 'box') continue;
        if (c.max.y <= p.y + step || c.min.y >= p.y + height) continue;
        const cx = Math.max(c.min.x, Math.min(p.x, c.max.x));
        const cz = Math.max(c.min.z, Math.min(p.z, c.max.z));
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r;
          p.z = cz + (dz / d) * r;
        } else {
          // Centre is inside the box: push out on the shallowest axis.
          const pen = [p.x - c.min.x, c.max.x - p.x, p.z - c.min.z, c.max.z - p.z];
          const m = Math.min(...pen);
          if (m === pen[0]) p.x = c.min.x - r;
          else if (m === pen[1]) p.x = c.max.x + r;
          else if (m === pen[2]) p.z = c.min.z - r;
          else p.z = c.max.z + r;
        }
      }
      scratch.length = 0;
    }

    p.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, p.x));
    p.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, p.z));

    // Vertical movement.
    const wasGround = body.onGround;
    let newY = p.y + body.vel.y * dt;

    if (body.vel.y > 0) {
      const ceil = this.ceilingAbove(p.x, p.z, p.y + height - 0.05, r * 0.7);
      if (ceil !== null && newY + height > ceil) {
        newY = ceil - height;
        body.vel.y = 0;
      }
    }

    let ground = this.groundHeight(p.x, p.z, Math.max(p.y, newY) + step, r * 0.7);
    const swimLevel = WATER_LEVEL - 1.25;
    const overWater = ground < swimLevel;
    if (overWater) ground = swimLevel;

    body.onGround = false;
    if (newY <= ground) {
      newY = ground;
      if (body.vel.y < 0) body.vel.y = 0;
      body.onGround = true;
    } else if (wasGround && body.vel.y <= 0 && newY - ground < 0.7) {
      // Stick to ramps and small drops instead of bouncing down them.
      newY = ground;
      body.vel.y = 0;
      body.onGround = true;
    }
    p.y = newY;
    body.groundY = ground;
    body.swimming = overWater && newY <= swimLevel + 0.05;
  }

  ceilingAbove(x, z, fromY, radius) {
    let best = null;
    const list = this.query(x - radius, z - radius, x + radius, z + radius, scratch);
    for (const c of list) {
      if (c.shape === 'box') {
        if (c.min.y < fromY) continue;
        const cx = Math.max(c.min.x, Math.min(x, c.max.x));
        const cz = Math.max(c.min.z, Math.min(z, c.max.z));
        const dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz > radius * radius) continue;
        if (best === null || c.min.y < best) best = c.min.y;
      } else {
        if (x < c.min.x || x > c.max.x || z < c.min.z || z > c.max.z) continue;
        const sh = c.heightAt(x, z);
        if (sh === null || sh - 0.2 < fromY) continue;
        if (best === null || sh - 0.2 < best) best = sh - 0.2;
      }
    }
    scratch.length = 0;
    return best;
  }

  // Raycast against colliders and terrain. dir must be normalised.
  // filter(collider) can return false to skip a collider.
  raycast(o, d, maxDist, filter = null, includeTerrain = true) {
    let best = null;
    let bestT = maxDist;
    const stamp = ++stampCounter;

    // 2D DDA over hash cells.
    let ix = Math.floor(o.x / CELL), iz = Math.floor(o.z / CELL);
    const stepX = d.x > 0 ? 1 : -1, stepZ = d.z > 0 ? 1 : -1;
    const tDeltaX = Math.abs(d.x) < 1e-9 ? Infinity : CELL / Math.abs(d.x);
    const tDeltaZ = Math.abs(d.z) < 1e-9 ? Infinity : CELL / Math.abs(d.z);
    let tMaxX = Math.abs(d.x) < 1e-9 ? Infinity
      : ((d.x > 0 ? (ix + 1) * CELL - o.x : o.x - ix * CELL) / Math.abs(d.x));
    let tMaxZ = Math.abs(d.z) < 1e-9 ? Infinity
      : ((d.z > 0 ? (iz + 1) * CELL - o.z : o.z - iz * CELL) / Math.abs(d.z));
    let tCell = 0;

    for (let guard = 0; guard < 400; guard++) {
      const arr = this.cells.get(this.key(ix, iz));
      if (arr) {
        for (const c of arr) {
          if (c.stamp === stamp) continue;
          c.stamp = stamp;
          if (filter && !filter(c)) continue;
          const hit = c.shape === 'box' ? rayBox(o, d, c, bestT) : raySlope(o, d, c, bestT);
          if (hit && hit.t < bestT) {
            bestT = hit.t;
            best = hit;
            best.collider = c;
          }
        }
      }
      const tNext = Math.min(tMaxX, tMaxZ);
      if (tNext > bestT || tNext > maxDist) break;
      tCell = tNext;
      if (tMaxX < tMaxZ) { ix += stepX; tMaxX += tDeltaX; } else { iz += stepZ; tMaxZ += tDeltaZ; }
    }

    if (includeTerrain) {
      const th = this.rayTerrain(o, d, bestT);
      if (th && th.t < bestT) {
        best = th;
        bestT = th.t;
      }
    }
    if (best) {
      best.point = { x: o.x + d.x * best.t, y: o.y + d.y * best.t, z: o.z + d.z * best.t };
    }
    return best;
  }

  rayTerrain(o, d, maxDist) {
    const stepLen = 1.0;
    let prevT = 0;
    let prevF = o.y - this.terrainHeight(o.x, o.z);
    if (prevF < 0) return null;
    for (let t = stepLen; t <= maxDist + stepLen; t += stepLen) {
      const tt = Math.min(t, maxDist);
      const x = o.x + d.x * tt, y = o.y + d.y * tt, z = o.z + d.z * tt;
      const f = y - this.terrainHeight(x, z);
      if (f <= 0) {
        let lo = prevT, hi = tt;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          const fm = o.y + d.y * mid - this.terrainHeight(o.x + d.x * mid, o.z + d.z * mid);
          if (fm > 0) lo = mid; else hi = mid;
        }
        return { t: hi, normal: { x: 0, y: 1, z: 0 }, terrain: true, collider: null };
      }
      prevT = tt;
      prevF = f;
      if (tt >= maxDist) break;
    }
    return null;
  }

  // True when nothing blocks the segment a->b.
  lineOfSight(a, b, filter) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return true;
    const d = { x: dx / len, y: dy / len, z: dz / len };
    return !this.raycast(a, d, len - 0.05, filter);
  }
}

const scratch = [];

export function rayBox(o, d, c, maxT) {
  let tmin = 0, tmax = maxT, axis = -1, sign = 0;
  const mins = [c.min.x, c.min.y, c.min.z], maxs = [c.max.x, c.max.y, c.max.z];
  const os = [o.x, o.y, o.z], ds = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ds[i]) < 1e-9) {
      if (os[i] < mins[i] || os[i] > maxs[i]) return null;
      continue;
    }
    const inv = 1 / ds[i];
    let t1 = (mins[i] - os[i]) * inv, t2 = (maxs[i] - os[i]) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (axis === -1) return null; // origin inside the box: ignore
  const normal = { x: 0, y: 0, z: 0 };
  normal[['x', 'y', 'z'][axis]] = sign;
  return { t: tmin, normal };
}

function raySlope(o, d, c, maxT) {
  // Clip to the bounding box, then march for a sign change of y - h(x,z).
  let tmin = 0, tmax = maxT;
  const mins = [c.min.x, c.min.y - 0.3, c.min.z], maxs = [c.max.x, c.max.y + 0.1, c.max.z];
  const os = [o.x, o.y, o.z], ds = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ds[i]) < 1e-9) {
      if (os[i] < mins[i] || os[i] > maxs[i]) return null;
      continue;
    }
    const inv = 1 / ds[i];
    let t1 = (mins[i] - os[i]) * inv, t2 = (maxs[i] - os[i]) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  const f = (t) => {
    const x = o.x + d.x * t, z = o.z + d.z * t;
    const h = c.heightAt(x, z);
    if (h === null) return null;
    return o.y + d.y * t - h;
  };
  const steps = 14;
  let prevT = tmin, prevF = f(tmin);
  for (let i = 1; i <= steps; i++) {
    const t = tmin + ((tmax - tmin) * i) / steps;
    const ft = f(t);
    if (prevF !== null && ft !== null && Math.sign(prevF) !== Math.sign(ft)) {
      let lo = prevT, hi = t, flo = prevF;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2;
        const fm = f(mid);
        if (fm === null) break;
        if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid;
      }
      const x = o.x + d.x * hi, z = o.z + d.z * hi;
      const e = 0.05;
      const hx = (c.heightAt(x + e, z) ?? 0) - (c.heightAt(x - e, z) ?? 0);
      const hz = (c.heightAt(x, z + e) ?? 0) - (c.heightAt(x, z - e) ?? 0);
      const n = { x: -hx / (2 * e), y: 1, z: -hz / (2 * e) };
      const l = Math.hypot(n.x, n.y, n.z);
      return { t: hi, normal: { x: n.x / l, y: n.y / l, z: n.z / l } };
    }
    prevT = t;
    prevF = ft;
  }
  return null;
}
