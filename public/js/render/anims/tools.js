// Pickaxe, building and healing animations.
import { makeClip, sn, cs, add, bump, seg, lerp, ease } from './pose.js';

const carry = (u) => ({
  upperArmR: [0.5, 0.1, 0.1], lowerArmR: [1.0, 0, 0], upperArmL: [0.1 * sn(u), 0, -0.1], lowerArmL: [0.25, 0, 0],
  spine2: [0, -0.1, 0],
});

// Windup over the shoulder, chop, recover. `variant` changes the plane of the swing.
function swing(u, variant) {
  const wind = seg(u, 0, 0.3), chop = seg(u, 0.3, 0.45), rec = seg(u, 0.45, 1);
  const x = lerp(lerp(0.7, 3.2, wind), -0.1, chop);
  const arm = lerp(x, 0.7, rec);
  const side = [0, 0.7, -0.7][variant];
  const twistW = lerp(lerp(0, 0.45, wind), -0.35, chop);
  const twist = lerp(twistW, 0, rec);
  return {
    upperArmR: [arm, 0, 0.1 + side * 0.4 * (wind - rec)], lowerArmR: [lerp(1.0, 0.5, chop) * (1 - rec) + rec * 1.0, 0, 0],
    upperArmL: [arm * 0.8, 0, -0.35], lowerArmL: [0.5, 0, 0],
    spine2: [lerp(-0.1, 0.25, chop) * (1 - rec), twist, side * 0.05 * (chop - rec)],
    spine1: [0, twist * 0.5, 0], hipsPos: [0, -0.04 * chop * (1 - rec), 0],
  };
}

export function toolClips() {
  const clips = [
    makeClip('pickaxe.equip', 0.3, (t, u) => {
      const e = ease(u), c = carry(0);
      const out = {};
      for (const [k, v] of Object.entries(c)) out[k] = v.map((x) => x * e);
      return out;
    }, { loop: false }),
    makeClip('pickaxe.idle', 2.2, (t, u) => add(carry(u), { spine3: [0.012 * sn(u), 0, 0] })),
    makeClip('pickaxe.move', 0.7, (t, u) => add(carry(u), { spine3: [0.02 * sn(u, 2), 0.04 * sn(u), 0], upperArmL: [0.2 * sn(u, 1, 0), 0, 0] })),
    makeClip('pickaxe.swing1', 0.42, (t, u) => swing(u, 0), { loop: false }),
    makeClip('pickaxe.swing2', 0.42, (t, u) => swing(u, 1), { loop: false }),
    makeClip('pickaxe.swing3', 0.42, (t, u) => swing(u, 2), { loop: false }),
    makeClip('pickaxe.harvestHit', 0.3, (t, u) => {
      const k = bump(u, 0, 0.15, 0.2, 1);
      return { upperArmR: [-0.3 * k, 0, 0], upperArmL: [-0.2 * k, 0, 0], spine2: [0.06 * k, 0, 0], head: [0.05 * k, 0, 0] };
    }, { loop: false }),

    // Build mode: hands held low and ready, like working a wrist console.
    makeClip('build.stance', 2.0, (t, u) => add({
      upperArmR: [0.55, 0.2, -0.1], lowerArmR: [1.35, 0, 0], upperArmL: [0.5, 0, 0.2], lowerArmL: [1.4, 0, 0],
      spine2: [-0.03, 0, 0], head: [0.05, 0, 0],
    }, { spine3: [0.01 * sn(u), 0, 0], handR: [0.1 * sn(u, 2), 0, 0] })),
    makeClip('build.move', 0.7, (t, u) => add({
      upperArmR: [0.55, 0.2, -0.1], lowerArmR: [1.35, 0, 0], upperArmL: [0.5, 0, 0.2], lowerArmL: [1.4, 0, 0],
    }, { spine3: [0.02 * sn(u, 2), 0.03 * sn(u), 0] })),
    makeClip('build.place', 0.2, (t, u) => {
      const k = bump(u, 0, 0.4, 0.5, 1);
      return { upperArmR: [0.5 * k, 0, 0], upperArmL: [0.4 * k, 0, 0], spine2: [0.06 * k, 0, 0], head: [0.04 * k, 0, 0] };
    }, { loop: false }),
    makeClip('edit.stance', 2.0, (t, u) => add({
      upperArmR: [1.05, 0.2, -0.25], lowerArmR: [1.2, 0, 0], upperArmL: [0.95, 0, 0.3], lowerArmL: [1.25, 0, 0],
      spine2: [-0.06, 0, 0], head: [0.05, 0, 0],
    }, { handL: [0.15 * sn(u, 3), 0, 0], handR: [0.1 * cs(u, 3), 0, 0] })),
    makeClip('edit.confirm', 0.3, (t, u) => {
      const k = bump(u, 0, 0.3, 0.4, 1);
      return { upperArmR: [0.3 * k, 0, 0], upperArmL: [0.3 * k, 0, 0], spine2: [0.05 * k, 0, 0] };
    }, { loop: false }),
  ];

  // Healing: all interruptible loops; the animator scales them to the heal time.
  const mouth = (open) => ({ upperArmR: [1.7 * open, 0.2 * open, -0.5 * open], lowerArmR: [1.55 * open, 0, 0], head: [-0.25 * open, 0, 0] });
  clips.push(
    // Bandage: left hand steadies the right forearm while it winds around.
    makeClip('heal.bandage', 1.8, (t, u) => ({
      upperArmL: [0.9, 0, 0.5], lowerArmL: [1.2, 0, 0], upperArmR: [0.9, 0, -0.4], lowerArmR: [1.2, 0, 0],
      handR: [0, 0, 0.5 * sn(u, 3)], spine2: [0.1, 0, 0], head: [0.3, 0, 0],
    })),
    // Medkit: both hands open a box at the chest, rummage, close it.
    makeClip('heal.medkit', 2.6, (t, u) => {
      const open = bump(u, 0.05, 0.2, 0.8, 0.95);
      return {
        upperArmL: [1.0 * open, 0, 0.3], lowerArmL: [1.1, 0, 0], upperArmR: [1.0 * open, 0, -0.3], lowerArmR: [1.1, 0, 0],
        handR: [0.35 * sn(u, 4) * open, 0, 0], spine2: [0.12 * open, 0, 0], head: [0.35 * open, 0, 0],
      };
    }),
    makeClip('heal.sip', 1.2, (t, u) => mouth(bump(u, 0.15, 0.35, 0.65, 0.85))),
    makeClip('heal.drink', 2.0, (t, u) => add(mouth(bump(u, 0.1, 0.3, 0.8, 0.95)), { spine2: [-0.1 * bump(u, 0.3, 0.45, 0.7, 0.9), 0, 0] })),
    makeClip('heal.jug', 3.0, (t, u) => {
      const up = bump(u, 0.05, 0.2, 0.85, 0.97);
      return add(mouth(up), { head: [-0.3 * up, 0, 0.04 * sn(u, 6) * up], spine2: [-0.15 * up, 0, 0], spine3: [-0.1 * up, 0, 0], upperLegL: [0, 0, 0] });
    }),
  );
  return clips;
}
