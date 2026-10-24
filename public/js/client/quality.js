// Graphics quality presets, hardware auto-detect and the dynamic-resolution
// controller. One place decides what a "Medium" laptop gets, so every system
// (shadows, fog, grass, character LOD, particles, post FX) reads the same row.
import { settings } from './binds.js';

// pixel: max device-pixel-ratio. fog: [near, far]. lod: character distance bands.
// targetMs: the frame time dynamic resolution tries to hold.
export const PRESETS = {
  low: { label: 'Low', pixel: 0.9, minScale: 0.5, shadows: false, shadowSize: 0, fog: [110, 380], far: 520, grass: 'low', terrainStride: 2, lod: [22, 80], particles: 150, post: false, targetMs: 33.4 },
  medium: { label: 'Medium', pixel: 1, minScale: 0.6, shadows: true, shadowSize: 1024, fog: [160, 560], far: 900, grass: 'high', lod: [34, 120], particles: 300, post: false, targetMs: 16.9 },
  high: { label: 'High', pixel: 1.5, minScale: 0.7, shadows: true, shadowSize: 2048, fog: [200, 720], far: 1600, grass: 'high', lod: [40, 150], particles: 420, post: false, targetMs: 16.9 },
  epic: { label: 'Epic', pixel: 2, minScale: 0.75, shadows: true, shadowSize: 4096, fog: [240, 900], far: 2200, grass: 'high', lod: [60, 200], particles: 600, post: true, targetMs: 16.9 },
};

function gpuName() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch { return ''; }
}

// A guess from what the browser will tell us. Never picks Epic: that is opt-in.
export function detectQuality() {
  const gpu = gpuName();
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu) || mobile) return 'low';
  if (/intel/i.test(gpu)) return cores >= 8 && mem >= 8 ? 'medium' : 'low';
  if (/nvidia|geforce|radeon|rx |apple m|apple gpu/i.test(gpu)) return cores >= 6 && mem >= 8 ? 'high' : 'medium';
  return cores >= 6 ? 'medium' : 'low';
}

export function currentQuality() {
  let id = settings.quality;
  // Older saved settings: "low detail" meant the low preset.
  if (!id || id === 'auto') id = !settings.quality && settings.detail === 'low' ? 'low' : detectQuality();
  return { id, ...PRESETS[id] };
}

// Measures frame time and nudges the render scale so the game holds its target.
// Down fast (stutter is worse than blur), up slowly.
export class Perf {
  constructor(q, onScale) {
    this.q = q;
    this.onScale = onScale;
    this.scale = 1;
    this.ema = q.targetMs;
    this.slow = 0;
    this.fast = 0;
    this.frames = 0;
    this.acc = 0;
    this.fps = 0;
    this.worst = 0;
    this.winWorst = 0;
    this.dynamic = settings.dynamicRes !== false;
  }

  tick(dtMs) {
    this.ema += (dtMs - this.ema) * 0.08;
    this.frames++;
    this.acc += dtMs;
    this.winWorst = Math.max(this.winWorst, dtMs);
    if (this.acc >= 500) {
      this.fps = Math.round((this.frames * 1000) / this.acc);
      this.worst = this.winWorst;
      this.frames = 0; this.acc = 0; this.winWorst = 0;
      if (this.dynamic) this.adjust();
    }
  }

  adjust() {
    const target = this.q.targetMs;
    if (this.ema > target * 1.25) { this.slow++; this.fast = 0; } else if (this.ema < target * 0.7) { this.fast++; this.slow = 0; } else { this.slow = 0; this.fast = 0; }
    if (this.slow >= 2 && this.scale > this.q.minScale) { this.scale = Math.max(this.q.minScale, this.scale - 0.1); this.slow = 0; this.onScale(this.scale); }
    else if (this.fast >= 6 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.05); this.fast = 0; this.onScale(this.scale); }
  }
}
