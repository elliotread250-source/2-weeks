// 25 original emotes (ids 1..25, see EMOTE_NAMES). Each runs 2 to 8 seconds;
// the gentle ones loop. None copies a real game's dance.
import { makeClip, TAU, sn, cs, add, bump, seg, lerp } from './pose.js';

const A = (x, z, lx = 0) => ({ upperArmL: [x, 0, -z], upperArmR: [x, 0, z], lowerArmL: [lx, 0, 0], lowerArmR: [lx, 0, 0] });
const legsBent = (k) => ({ upperLegL: [0.5 * k, 0, 0], lowerLegL: [-0.9 * k, 0, 0], upperLegR: [0.5 * k, 0, 0], lowerLegR: [-0.9 * k, 0, 0] });

export function emoteClips() {
  const defs = [
    ['Wave', 2.4, false, (t, u) => {
      const up = bump(u, 0, 0.15, 0.85, 1);
      return { upperArmR: [0.2 * up, 0, 2.5 * up], lowerArmR: [1.2 * up + 0.6 * sn(u, 4) * up, 0, 0], head: [0, 0.3 * up, 0.08 * up], spine2: [0, 0, -0.05 * up] };
    }],
    ['Sway Jam', 4, true, (t, u) => add(A(0.4, 0.5, 0.9), { hips: [0, 0.2 * sn(u, 2), 0.12 * sn(u, 2)], hipsPos: [0.1 * sn(u, 2), -0.03 * (1 + cs(u, 4)), 0], spine2: [0, -0.25 * sn(u, 2), -0.1 * sn(u, 2)], head: [0, 0.2 * sn(u, 2), 0],
      upperArmL: [0.5 + 0.5 * sn(u, 2), 0, -0.6], upperArmR: [0.5 - 0.5 * sn(u, 2), 0, 0.6], upperLegL: [0.1 * sn(u, 2), 0, -0.05], upperLegR: [-0.1 * sn(u, 2), 0, 0.05] })],
    ['Pogo Hop', 2.4, true, (t, u) => {
      const h = Math.abs(sn(u, 1, 0));
      return add({ hipsPos: [0, 0.22 * h - 0.05, 0], upperLegL: [0.3 * (1 - h), 0, 0], lowerLegL: [-0.6 * (1 - h), 0, 0], upperLegR: [0.3 * (1 - h), 0, 0], lowerLegR: [-0.6 * (1 - h), 0, 0], head: [0, 0, 0.1 * sn(u, 2)] },
        { upperArmL: [0.2, 0, -0.5], upperArmR: [0.2, 0, 0.5], lowerArmL: [1.3, 0, 0], lowerArmR: [1.3, 0, 0] });
    }],
    ['Flex', 3, false, (t, u) => {
      const k = bump(u, 0.05, 0.25, 0.8, 0.95);
      return add({ spine2: [-0.1 * k, 0, 0], head: [0, 0, 0.1 * k], hipsPos: [0, -0.02 * k, 0], upperLegL: [0, 0, -0.12 * k], upperLegR: [0, 0, 0.12 * k] },
        { upperArmL: [0.3 * k, 0, -1.5 * k], upperArmR: [0.3 * k, 0, 1.5 * k], lowerArmL: [2.4 * k + 0.1 * sn(u, 6) * k, 0, 0], lowerArmR: [2.4 * k - 0.1 * sn(u, 6) * k, 0, 0] });
    }],
    ['Clap', 2.0, true, (t, u) => {
      const c = 0.5 + 0.5 * sn(u, 4);
      return add({ head: [0.1, 0, 0], spine2: [0.05, 0, 0] }, { upperArmL: [1.2, 0, -0.1 - 0.5 * (1 - c)], upperArmR: [1.2, 0, 0.1 + 0.5 * (1 - c)], lowerArmL: [0.9, 0, 0], lowerArmR: [0.9, 0, 0] });
    }],
    ['Spin Cycle', 2.0, true, (t, u) => add({ hips: [0, TAU * u, 0], hipsPos: [0, 0.03 * sn(u, 2), 0] }, A(0.3, 1.0, 0.3), { head: [0, 0, 0.1] })],
    ['Robot March', 2.0, true, (t, u) => {
      const s = Math.sign(sn(u, 2)) * Math.min(1, Math.abs(sn(u, 2)) * 4);
      return add({ hipsPos: [0, 0, 0], upperLegL: [0.9 * Math.max(0, s), 0, 0], upperLegR: [0.9 * Math.max(0, -s), 0, 0], lowerLegL: [-0.1, 0, 0], lowerLegR: [-0.1, 0, 0], head: [0, 0.4 * Math.tanh(sn(u, 1) * 5), 0] },
        { upperArmL: [-0.2 + 1.4 * Math.max(0, -s), 0, -0.1], upperArmR: [-0.2 + 1.4 * Math.max(0, s), 0, 0.1], lowerArmL: [1.5, 0, 0], lowerArmR: [1.5, 0, 0] });
    }],
    ['Salute', 2.2, false, (t, u) => {
      const k = bump(u, 0, 0.15, 0.8, 0.95);
      return { upperArmR: [1.1 * k, 0.6 * k, 1.1 * k], lowerArmR: [2.2 * k, 0, 0], head: [-0.05 * k, 0, 0], spine2: [-0.08 * k, 0, 0] };
    }],
    ['Bow', 3, false, (t, u) => {
      const k = bump(u, 0.05, 0.35, 0.6, 0.9);
      return add({ hips: [0.5 * k, 0, 0], spine1: [0.4 * k, 0, 0], spine2: [0.4 * k, 0, 0], head: [0.2 * k, 0, 0], upperLegL: [-0.4 * k, 0, 0], upperLegR: [-0.4 * k, 0, 0] },
        { upperArmL: [0.2, 0, -0.1], upperArmR: [0.6 * k, 0, 0.3 * k], lowerArmR: [1.3 * k, 0, 0] });
    }],
    ['Thinker', 4, true, (t, u) => add({ spine2: [0.1, 0, 0], head: [0.15 + 0.05 * sn(u), 0.2 * sn(u, 0.5), 0.05], upperLegR: [0.1 + 0.15 * Math.max(0, sn(u, 2)), 0, 0], lowerLegR: [-0.2 * Math.max(0, sn(u, 2)), 0, 0] },
      { upperArmR: [1.3, 0.3, -0.2], lowerArmR: [2.1, 0, 0], upperArmL: [0.8, 0, 0.4], lowerArmL: [1.5, 0, 0] })],
    ['Jumping Jacks', 3.2, true, (t, u) => {
      const o = 0.5 - 0.5 * cs(u, 2);
      return add({ hipsPos: [0, 0.1 * Math.abs(sn(u, 2)) - 0.0, 0], upperLegL: [0, 0, -0.45 * o], upperLegR: [0, 0, 0.45 * o] },
        { upperArmL: [0, 0, -(0.2 + 2.7 * o)], upperArmR: [0, 0, 0.2 + 2.7 * o], lowerArmL: [0.1, 0, 0], lowerArmR: [0.1, 0, 0] });
    }],
    ['Shrug', 2.4, false, (t, u) => {
      const k = bump(u, 0.1, 0.25, 0.7, 0.85);
      return add({ head: [0, 0, 0.15 * k], spine3: [0, 0, -0.06 * k], hipsPos: [0, 0.01 * k, 0] },
        { upperArmL: [0.2 * k, 0, -0.6 * k], upperArmR: [0.2 * k, 0, 0.6 * k], lowerArmL: [1.4 * k, 0, 0], lowerArmR: [1.4 * k, 0, 0], handL: [0, 0, -0.5 * k], handR: [0, 0, 0.5 * k] });
    }],
    ['Victory Pose', 4, false, (t, u) => {
      const k = bump(u, 0, 0.2, 0.85, 1);
      return add({ spine2: [-0.2 * k, 0, 0], head: [-0.2 * k, 0, 0], hipsPos: [0, 0, 0] }, { upperArmL: [2.9 * k, 0, -0.35 * k], upperArmR: [2.9 * k, 0, 0.35 * k], lowerArmL: [0.1, 0, 0], lowerArmR: [0.1, 0, 0] },
        { upperLegL: [0, 0, -0.1 * k], upperLegR: [0, 0, 0.1 * k] });
    }],
    ['Slow Clap', 5, true, (t, u) => {
      const c = 0.5 + 0.5 * sn(u, 2.5);
      return add({ head: [0, 0.15 * sn(u, 0.5), 0], spine2: [0.03, 0, 0] }, { upperArmL: [1.3, 0, -0.1 - 0.4 * (1 - c)], upperArmR: [1.3, 0, 0.1 + 0.4 * (1 - c)], lowerArmL: [0.7, 0, 0], lowerArmR: [0.7, 0, 0] });
    }],
    ['Hip Roll', 3.2, true, (t, u) => add({ hips: [0.12 * cs(u, 2), 0, 0.15 * sn(u, 2)], hipsPos: [0.08 * sn(u, 2), -0.02, 0.05 * cs(u, 2)], spine2: [-0.08 * cs(u, 2), 0, -0.1 * sn(u, 2)], head: [0, 0, 0.08 * sn(u, 2)] },
      { upperArmL: [0.1, 0, -0.9], upperArmR: [0.1, 0, 0.9], lowerArmL: [1.6, 0, 0], lowerArmR: [1.6, 0, 0], handL: [0, 0, 0], upperLegL: [0.1, 0, -0.1], upperLegR: [0.1, 0, 0.1] })],
    ['Windmill', 2.4, true, (t, u) => add({ spine2: [0, 0.25 * sn(u, 2), 0], hipsPos: [0, -0.05, 0] }, legsBent(0.3),
      { upperArmL: [TAU * u * 1 % TAU * 0 + (cs(u) * 0 + TAU * u), 0, -0.2], upperArmR: [-(TAU * u), 0, 0.2], lowerArmL: [0.1, 0, 0], lowerArmR: [0.1, 0, 0] })],
    ['Glide Step', 3, true, (t, u) => {
      const s = sn(u, 1);
      return add({ hips: [0, 0.1, 0], hipsPos: [0.04 * s, 0.01 * cs(u, 2), 0.18 * s], upperLegL: [0.3 * s, 0, 0], upperLegR: [-0.3 * s, 0, 0], lowerLegL: [-0.4 * Math.max(0, -s), 0, 0], lowerLegR: [-0.4 * Math.max(0, s), 0, 0], spine2: [0, -0.15, 0] },
        { upperArmL: [0.5 * s, 0, -0.4], upperArmR: [-0.5 * s, 0, 0.4], lowerArmL: [0.9, 0, 0], lowerArmR: [0.9, 0, 0] });
    }],
    ['Cheer', 2.2, true, (t, u) => {
      const h = Math.abs(sn(u, 1));
      return add({ hipsPos: [0, 0.2 * h, 0], upperLegL: [0.3 * (1 - h), 0, -0.1], lowerLegL: [-0.5 * (1 - h), 0, 0], upperLegR: [0.3 * (1 - h), 0, 0.1], lowerLegR: [-0.5 * (1 - h), 0, 0], head: [-0.2, 0, 0] },
        { upperArmL: [2.7 + 0.2 * sn(u, 2), 0, -0.4], upperArmR: [2.7 - 0.2 * sn(u, 2), 0, 0.4], lowerArmL: [0.3, 0, 0], lowerArmR: [0.3, 0, 0] });
    }],
    ['Stretch', 5, false, (t, u) => {
      const up = bump(u, 0.05, 0.25, 0.9, 1), lean = sn(u, 1) * up;
      return add({ spine1: [0, 0, 0.25 * lean], spine2: [-0.1 * up, 0, 0.3 * lean], hips: [0, 0, -0.08 * lean], head: [0, 0, 0.15 * lean] },
        { upperArmL: [2.9 * up, 0, -0.25 * up], upperArmR: [2.9 * up, 0, 0.25 * up], lowerArmL: [0.2, 0, 0], lowerArmR: [0.2, 0, 0], handL: [0.3 * up, 0, 0] });
    }],
    ['Shadow Box', 3, true, (t, u) => {
      const l = Math.max(0, sn(u, 3)), r = Math.max(0, sn(u, 3, Math.PI));
      return add({ spine2: [0.1, 0.3 * (r - l), 0], hipsPos: [0, -0.06 + 0.02 * cs(u, 6), 0], hips: [0, 0.15 * (r - l), 0], head: [0.1, 0, 0] }, legsBent(0.35),
        { upperArmL: [1.2 + 0.3 * l, 0, -0.1], upperArmR: [1.2 + 0.3 * r, 0, 0.1], lowerArmL: [1.9 - 1.8 * l, 0, 0], lowerArmR: [1.9 - 1.8 * r, 0, 0] });
    }],
    ['Conductor', 4, true, (t, u) => add({ spine2: [0, 0.2 * sn(u), 0], head: [0, 0.15 * sn(u), 0] },
      { upperArmR: [1.2 + 0.4 * sn(u, 2), 0, 0.6 + 0.2 * cs(u)], lowerArmR: [0.9, 0, 0], upperArmL: [0.9 + 0.3 * sn(u, 1, 1.5), 0, -0.5], lowerArmL: [1.0, 0, 0], handR: [0.4 * sn(u, 2), 0, 0] })],
    ['Heart Hands', 3.2, false, (t, u) => {
      const k = bump(u, 0.05, 0.25, 0.8, 0.95), pulse = 0.04 * sn(u, 3) * k;
      return add({ head: [0, 0, 0.12 * k], spine2: [-0.05 * k, 0, 0], hipsPos: [0, 0.01 * sn(u, 3) * k, 0] },
        { upperArmL: [1.3 * k, 0.1, -0.2 * k + pulse], upperArmR: [1.3 * k, -0.1, 0.2 * k - pulse], lowerArmL: [1.2 * k, 0, 0.1], lowerArmR: [1.2 * k, 0, -0.1], handL: [0, 0, -0.7 * k], handR: [0, 0, 0.7 * k] });
    }],
    ['Point and Laugh', 3, true, (t, u) => {
      const sh = 0.04 * sn(u, 6);
      return add({ spine2: [-0.15 + sh, 0, 0], spine3: [0, 0, sh], head: [-0.3, 0, 0.1], hipsPos: [0, 0.015 * sn(u, 6), 0] },
        { upperArmR: [1.5, 0, 0.1], lowerArmR: [0.1, 0, 0], upperArmL: [0.9, 0, -0.2], lowerArmL: [1.6, 0, 0], handR: [0, 0, 0] });
    }],
    ['Squat Pump', 2.4, true, (t, u) => {
      const d = 0.5 - 0.5 * cs(u, 2);
      return add({ hipsPos: [0, -0.35 * d, 0.04 * d], spine1: [0.2 * d, 0, 0], head: [-0.15 * d, 0, 0] },
        { upperLegL: [1.25 * d, 0, -0.2 * d], lowerLegL: [-1.9 * d, 0, 0], upperLegR: [1.25 * d, 0, 0.2 * d], lowerLegR: [-1.9 * d, 0, 0], footL: [0.5 * d, 0, 0], footR: [0.5 * d, 0, 0] },
        { upperArmL: [0.4 + 1.2 * d, 0, -0.2], upperArmR: [0.4 + 1.2 * d, 0, 0.2], lowerArmL: [1.6 - 0.8 * d, 0, 0], lowerArmR: [1.6 - 0.8 * d, 0, 0] });
    }],
    ['Rock Out', 4, true, (t, u) => {
      const strum = sn(u, 4);
      return add({ hips: [0, -0.2, 0.05 * sn(u, 2)], hipsPos: [0, -0.04 + 0.02 * cs(u, 4), 0], spine2: [0, 0.2, 0.05 * sn(u, 2)], head: [0.1 + 0.15 * Math.max(0, sn(u, 2)), 0, 0] }, legsBent(0.3),
        { upperArmR: [0.8 + 0.25 * strum, 0, 0.3], lowerArmR: [0.8, 0, 0], upperArmL: [1.2, 0, -0.2], lowerArmL: [0.9, 0, 0] });
    }],
  ];
  return defs.map(([name, dur, loop, fn], i) => makeClip(`emote.${i + 1}`, dur, fn, { loop }));
}
void seg; void lerp;
