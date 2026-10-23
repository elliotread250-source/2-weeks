// Weapon holds and actions per weapon class: idle, move, ADS, fire, reload and
// equip. Eight classes share one parametrised builder, each with its own grip
// and its own reload motion.
import { makeClip, sn, cs, add, bump, seg, lerp, ease } from './pose.js';

// Right grip [x, y, z] + forearm bend, left grip [x, y, z] + forearm bend.
const GRIPS = {
  rifle: { R: [1.28, 0.1, -0.3], RL: 0.3, L: [1.5, 0, 0.45], LL: 0.2, spine: 0.04 },
  shotgun: { R: [1.25, 0.1, -0.3], RL: 0.35, L: [1.4, 0, 0.55], LL: 0.3, spine: 0.05 },
  smg: { R: [1.3, 0.1, -0.25], RL: 0.35, L: [1.4, 0, 0.4], LL: 0.45, spine: 0.04 },
  pistol: { R: [1.4, 0.05, -0.12], RL: 0.15, L: [1.35, 0, 0.1], LL: 0.45, spine: 0.02 },
  sniper: { R: [1.25, 0.1, -0.32], RL: 0.35, L: [1.55, 0, 0.5], LL: 0.2, spine: 0.06 },
  launcher: { R: [1.0, 0.1, -0.15], RL: 0.9, L: [1.2, 0, 0.6], LL: 0.7, spine: 0.05 },
  consumable: { R: [0.6, 0.1, -0.2], RL: 1.3, L: [0.55, 0, 0.25], LL: 1.3, spine: 0.02 },
  grenade: { R: [0.5, 0.1, -0.1], RL: 1.2, L: [0.2, 0, 0.1], LL: 0.4, spine: 0 },
};

export function holdPose(cls, { ads = false } = {}) {
  const g = GRIPS[cls];
  const a = ads ? 1 : 0;
  return {
    spine2: [-g.spine * (1 + a), -0.12 - 0.06 * a, 0], spine3: [-g.spine * 0.5, -0.1 * (1 - a), 0], head: [0, 0.1 * a, -0.05 * a],
    upperArmR: [g.R[0] + 0.15 * a, g.R[1], g.R[2] + 0.1 * a], lowerArmR: [g.RL - 0.15 * a, 0, 0],
    upperArmL: [g.L[0] + 0.1 * a, g.L[1], g.L[2] - 0.05 * a], lowerArmL: [g.LL, 0, 0],
  };
}

const moveSway = (u, k = 1) => ({ spine3: [0.02 * sn(u, 2 * k), 0.03 * sn(u, k), 0], upperArmR: [0.04 * sn(u, 2 * k), 0, 0], upperArmL: [0.04 * sn(u, 2 * k, 1), 0, 0] });

// Reload motions: [pose offsets over u in 0..1]. Each has its own gesture.
const RELOADS = {
  // Mag weapons: off-hand drops to the hip, pulls a fresh mag, slaps it in.
  rifle: (u) => magReload(u, 0.9),
  smg: (u) => magReload(u, 0.8),
  pistol: (u) => magReload(u, 0.6, true),
  // Shotgun: gun tilts, off-hand feeds shells from the chest three times.
  shotgun: (u) => {
    const feeds = [0.1, 0.38, 0.66];
    let k = 0;
    for (const s of feeds) k += bump(u, s, s + 0.06, s + 0.12, s + 0.2);
    return {
      spine2: [0, 0, -0.1 * bump(u, 0.05, 0.15, 0.85, 0.95)],
      upperArmR: [-0.15 * bump(u, 0.05, 0.15, 0.85, 0.95), 0, 0.2 * bump(u, 0.05, 0.15, 0.85, 0.95)],
      upperArmL: [-0.9 * k, 0, 0.1 * k], lowerArmL: [0.2 * k, 0, 0],
    };
  },
  // Sniper: right hand works the bolt (up, back, forward, down).
  sniper: (u) => {
    const bolt = bump(u, 0.2, 0.3, 0.38, 0.45) * 0.0 + (bump(u, 0.25, 0.4, 0.45, 0.55) - bump(u, 0.55, 0.6, 0.62, 0.7) * 0);
    const back = bump(u, 0.3, 0.45, 0.5, 0.62);
    return {
      upperArmR: [-0.2 * back, 0, 0.5 * bolt], lowerArmR: [0.5 * back, 0, 0],
      upperArmL: [-0.5 * bump(u, 0.7, 0.8, 0.9, 1), 0, 0.2 * bump(u, 0.7, 0.8, 0.9, 1)],
      spine2: [0, -0.1 * bump(u, 0.2, 0.3, 0.7, 0.8), 0],
    };
  },
  // Launcher: tube drops, off-hand loads from behind the shoulder.
  launcher: (u) => {
    const d = bump(u, 0.05, 0.2, 0.8, 0.95);
    const load = bump(u, 0.3, 0.45, 0.55, 0.7);
    return {
      upperArmR: [-0.5 * d, 0, 0], upperArmL: [-0.6 * d - 1.6 * load, 0, 0.3 * load], lowerArmL: [0.5 * load, 0, 0],
      spine2: [0.1 * d, 0.2 * load, 0], head: [0.1 * d, 0, 0],
    };
  },
};

function magReload(u, depth, pistol = false) {
  const out = bump(u, 0.1, 0.25, 0.3, 0.4);
  const reach = bump(u, 0.25, 0.4, 0.5, 0.62);
  const slap = bump(u, 0.55, 0.62, 0.65, 0.75);
  const lean = bump(u, 0.05, 0.2, 0.8, 0.95);
  return {
    spine2: [0, 0, 0.06 * lean], head: [0.1 * lean, 0, 0],
    upperArmR: [-0.1 * lean, 0, pistol ? 0 : 0.15 * lean],
    upperArmL: [-(0.8 * out + 0.9 * depth * reach) + 0.4 * slap, 0, -0.2 * reach],
    lowerArmL: [0.6 * reach - 0.2 * out, 0, 0],
  };
}

export function weaponClips() {
  const clips = [];
  for (const cls of Object.keys(GRIPS)) {
    const hold = (ads) => holdPose(cls, { ads });
    clips.push(makeClip(`${cls}.idle`, 2.5, (t, u) => add(hold(false), { spine3: [0.01 * sn(u), 0, 0], upperArmL: [0.015 * sn(u, 1, 1), 0, 0] })));
    clips.push(makeClip(`${cls}.move`, 0.7, (t, u) => add(hold(false), moveSway(u))));
    clips.push(makeClip(`${cls}.ads`, 2.0, (t, u) => add(hold(true), { spine3: [0.005 * sn(u), 0, 0] })));
    // Fire: an additive kick (hand and shoulders), one shot.
    const kick = cls === 'shotgun' || cls === 'sniper' ? 1 : cls === 'launcher' ? 1.4 : cls === 'smg' ? 0.35 : 0.55;
    clips.push(makeClip(`${cls}.fire`, 0.22, (t, u) => {
      const k = bump(u, 0, 0.12, 0.2, 1) * kick;
      return { spine2: [0.05 * k, 0, 0], spine3: [0.05 * k, 0, 0], upperArmR: [-0.2 * k, 0, 0.04 * k], upperArmL: [-0.14 * k, 0, 0], head: [-0.03 * k, 0, 0] };
    }, { loop: false }));
    const reload = RELOADS[cls] || (() => ({}));
    clips.push(makeClip(`${cls}.reload`, 2.4, (t, u) => add(hold(false), reload(u)), { loop: false }));
    clips.push(makeClip(`${cls}.equip`, 0.35, (t, u) => {
      const e = ease(u);
      const h = hold(false);
      const out = {};
      for (const [k, v] of Object.entries(h)) out[k] = v.map((x) => x * e);
      out.upperArmR = [lerp(0.2, h.upperArmR[0], e), h.upperArmR[1] * e, h.upperArmR[2] * e];
      return out;
    }, { loop: false }));
  }
  // Consumables and grenades act instead of firing; give them the same names.
  return clips;
}

export const WEAPON_CLASSES = Object.keys(GRIPS);
export const classOfWeapon = { ar: 'rifle', pump: 'shotgun', smg: 'smg', pistol: 'pistol', sniper: 'sniper', rocket: 'launcher' };

void seg; void cs;
