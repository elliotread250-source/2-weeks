// Animation authoring kit. Clips are written as pose functions (a few lines of
// maths per clip) and baked into THREE.AnimationClip keyframes at 30 fps, so
// there are no imported assets and every clip is plain data after load.
//
// Conventions (the character faces -Z, limbs hang along -Y at rest):
//   +X rotation on an arm or leg swings it forward; on a knee/elbow, +X on the
//   lower bone bends an elbow, -X bends a knee.
//   Left limbs go outward with -Z rotation, right limbs outward with +Z.
import * as THREE from 'three';

export const TAU = Math.PI * 2;

export const BONES = [
  'hips', 'spine1', 'spine2', 'spine3', 'neck', 'head',
  'upperArmL', 'lowerArmL', 'handL', 'upperArmR', 'lowerArmR', 'handR',
  'upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR',
];

// The legs and pelvis run locomotion; the torso, head and arms run the
// weapon/build layer. Two layers, blended per bone set.
export const LOWER = new Set(['hips', 'spine1', 'upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR']);
export const UPPER = new Set(['spine2', 'spine3', 'neck', 'head', 'upperArmL', 'lowerArmL', 'handL', 'upperArmR', 'lowerArmR', 'handR']);

export const sn = (u, k = 1, ph = 0) => Math.sin(TAU * u * k + ph);
export const cs = (u, k = 1, ph = 0) => Math.cos(TAU * u * k + ph);
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const ease = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
// 0 -> 1 across [a, b] of u, eased.
export const seg = (u, a, b) => ease((u - a) / (b - a));
// Hold a value, ramp to another and back: bumps at [a,b,c,d].
export const bump = (u, a, b, c, d) => seg(u, a, b) * (1 - seg(u, c, d));

// Merge poses: later entries add onto earlier ones (rotations in radians).
export function add(...poses) {
  const out = {};
  for (const p of poses) {
    if (!p) continue;
    for (const [k, v] of Object.entries(p)) {
      if (k === 'hipsPos') out.hipsPos = out.hipsPos ? out.hipsPos.map((x, i) => x + v[i]) : [...v];
      else out[k] = out[k] ? [out[k][0] + v[0], out[k][1] + v[1], out[k][2] + v[2]] : [...v];
    }
  }
  return out;
}

export function blend(a, b, t) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'hipsPos') {
      const x = a.hipsPos || [0, 0, 0], y = b.hipsPos || [0, 0, 0];
      out.hipsPos = x.map((v, i) => lerp(v, y[i], t));
    } else {
      const x = a[k] || [0, 0, 0], y = b[k] || [0, 0, 0];
      out[k] = [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)];
    }
  }
  return out;
}

// Mirror a pose left <-> right (swaps limbs, flips the sideways rotations).
export function mirror(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'hipsPos') { out.hipsPos = [-v[0], v[1], v[2]]; continue; }
    const m = k.endsWith('L') ? `${k.slice(0, -1)}R` : k.endsWith('R') ? `${k.slice(0, -1)}L` : k;
    out[m] = [v[0], -v[1], -v[2]];
  }
  return out;
}

// Bones that point up (spine, neck, head, pelvis) lean forward with -X. Clips
// are written so +X always means forward/down; flip them when baking.
const FLIP_X = new Set(['hips', 'spine1', 'spine2', 'spine3', 'neck', 'head']);

const REST_HIPS = 0.92;
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

// Bake poseFn(t, u) over [0, duration] into an AnimationClip. Loop clips must be
// periodic in u so the last key equals the first.
export function makeClip(name, duration, poseFn, { loop = true, fps = 30 } = {}) {
  const frames = Math.max(2, Math.round(duration * fps) + 1);
  const times = new Float32Array(frames);
  const samples = [];
  for (let i = 0; i < frames; i++) {
    const t = (i / (frames - 1)) * duration;
    times[i] = t;
    samples.push(poseFn(t, t / duration) || {});
  }
  const used = new Set();
  for (const s of samples) for (const k of Object.keys(s)) if (k !== 'hipsPos') used.add(k);
  const tracks = [];
  for (const bone of used) {
    const vals = new Float32Array(frames * 4);
    samples.forEach((s, i) => {
      const r = s[bone] || [0, 0, 0];
      _q.setFromEuler(_e.set(FLIP_X.has(bone) ? -r[0] : r[0], r[1], r[2], 'XYZ'));
      _q.toArray(vals, i * 4);
    });
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, vals));
  }
  if (samples.some((s) => s.hipsPos)) {
    const vals = new Float32Array(frames * 3);
    samples.forEach((s, i) => {
      const p = s.hipsPos || [0, 0, 0];
      vals[i * 3] = p[0]; vals[i * 3 + 1] = REST_HIPS + p[1]; vals[i * 3 + 2] = p[2];
    });
    tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, vals));
  }
  const clip = new THREE.AnimationClip(name, duration, tracks);
  clip.userData = { loop };
  return clip;
}

// Keep only tracks for the given bones: how one clip feeds a single layer.
export function onlyBones(clip, bones, suffix) {
  const tracks = clip.tracks.filter((t) => bones.has(t.name.split('.')[0]));
  const c = new THREE.AnimationClip(`${clip.name}${suffix}`, clip.duration, tracks);
  c.userData = clip.userData;
  return c;
}
