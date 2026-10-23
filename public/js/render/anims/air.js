// Jumping, falling, landing, skydiving, gliding and swimming.
import { makeClip, sn, cs, add, bump, seg, lerp } from './pose.js';

const arms = (x, z, lx = 0.3) => ({
  upperArmL: [x, 0, -z], upperArmR: [x, 0, z], lowerArmL: [lx, 0, 0], lowerArmR: [lx, 0, 0],
});

export function airClips() {
  return [
    makeClip('jumpStart', 0.3, (t, u) => {
      const crouch = bump(u, 0, 0.35, 0.4, 0.7);
      return add(
        { hipsPos: [0, -0.22 * crouch, 0], hips: [0.12 * crouch, 0, 0], spine1: [0.2 * crouch, 0, 0] },
        { upperLegL: [0.9 * crouch, 0, 0], lowerLegL: [-1.3 * crouch, 0, 0], upperLegR: [0.9 * crouch, 0, 0], lowerLegR: [-1.3 * crouch, 0, 0] },
        arms(lerp(-0.4, 1.1, seg(u, 0.35, 1)), 0.2),
      );
    }, { loop: false }),
    makeClip('jumpLoop', 0.7, (t, u) => add(
      { upperLegL: [0.5, 0, -0.04], lowerLegL: [-0.9 + 0.1 * sn(u), 0, 0], upperLegR: [-0.2, 0, 0.04], lowerLegR: [-0.6, 0, 0], hipsPos: [0, 0.02 * sn(u), 0] },
      arms(0.5 + 0.1 * sn(u), 0.55),
    )),
    makeClip('fallLoop', 0.5, (t, u) => add(
      { upperLegL: [0.35 + 0.1 * sn(u), 0, -0.12], lowerLegL: [-0.5, 0, 0], upperLegR: [0.1 + 0.1 * sn(u, 1, 3), 0, 0.12], lowerLegR: [-0.4, 0, 0], head: [-0.2, 0, 0] },
      arms(0.9 + 0.2 * sn(u), 0.9 + 0.15 * sn(u, 1, 1.5)),
    )),
    makeClip('landSoft', 0.35, (t, u) => {
      const d = bump(u, 0, 0.3, 0.45, 1);
      return add({ hipsPos: [0, -0.2 * d, 0], hips: [0.1 * d, 0, 0], spine1: [0.15 * d, 0, 0], upperLegL: [0.8 * d, 0, 0], lowerLegL: [-1.2 * d, 0, 0], upperLegR: [0.8 * d, 0, 0], lowerLegR: [-1.2 * d, 0, 0] }, arms(0.3 * d, 0.3));
    }, { loop: false }),
    makeClip('landHard', 0.7, (t, u) => {
      const d = bump(u, 0, 0.2, 0.55, 1);
      return add(
        { hipsPos: [0, -0.5 * d, 0.05 * d], hips: [0.25 * d, 0, 0], spine1: [0.45 * d, 0, 0], spine2: [0.3 * d, 0, 0], head: [-0.4 * d, 0, 0],
          upperLegL: [1.5 * d, 0, -0.1 * d], lowerLegL: [-2.2 * d, 0, 0], upperLegR: [1.4 * d, 0, 0.1 * d], lowerLegR: [-2.1 * d, 0, 0] },
        { upperArmL: [0.9 * d, 0, -0.2 * d], upperArmR: [0.9 * d, 0, 0.2 * d], lowerArmL: [0.2, 0, 0], lowerArmR: [0.2, 0, 0] },
      );
    }, { loop: false }),
    // Body-root tilt (belly down) is applied by the animator; these are the limbs.
    makeClip('skydiveFlat', 1.2, (t, u) => add(
      { spine1: [-0.25, 0, 0], spine2: [-0.2, 0, 0], head: [-0.5, 0, 0], hips: [0, 0, 0.03 * sn(u)],
        upperLegL: [-0.3, 0, -0.35], lowerLegL: [-0.5, 0, 0], upperLegR: [-0.2, 0, 0.35], lowerLegR: [-0.6, 0, 0] },
      { upperArmL: [1.2, 0, -1.2 + 0.08 * sn(u)], upperArmR: [1.2, 0, 1.2 - 0.08 * sn(u)], lowerArmL: [-0.3, 0, 0], lowerArmR: [-0.3, 0, 0] },
    )),
    makeClip('skydiveDive', 1.0, (t, u) => add(
      { spine1: [-0.1, 0, 0], head: [-0.3, 0, 0.02 * sn(u)], upperLegL: [-0.1, 0, -0.04], upperLegR: [-0.1, 0, 0.04], lowerLegL: [-0.15, 0, 0], lowerLegR: [-0.15, 0, 0] },
      { upperArmL: [-0.6, 0, -0.15], upperArmR: [-0.6, 0, 0.15], lowerArmL: [0.1, 0, 0], lowerArmR: [0.1, 0, 0] },
    )),
    makeClip('gliderDeploy', 0.5, (t, u) => add(
      { hipsPos: [0, 0, 0], upperLegL: [0.3, 0, -0.05], upperLegR: [0.2, 0, 0.05], lowerLegL: [-0.4, 0, 0], lowerLegR: [-0.3, 0, 0] },
      { upperArmL: [lerp(0.9, 2.8, seg(u, 0, 0.8)), 0, -0.25], upperArmR: [lerp(0.9, 2.8, seg(u, 0, 0.8)), 0, 0.25], lowerArmL: [0.2, 0, 0], lowerArmR: [0.2, 0, 0] },
    ), { loop: false }),
    makeClip('gliderLoop', 1.6, (t, u) => add(
      { hipsPos: [0, 0.01 * sn(u, 2), 0], upperLegL: [0.2 + 0.08 * sn(u), 0, -0.05], lowerLegL: [-0.35, 0, 0], upperLegR: [0.1 + 0.08 * sn(u, 1, 1), 0, 0.05], lowerLegR: [-0.3, 0, 0], spine1: [0.05, 0, 0] },
      { upperArmL: [2.8, 0, -0.25], upperArmR: [2.8, 0, 0.25], lowerArmL: [0.15, 0, 0], lowerArmR: [0.15, 0, 0] },
    )),
    makeClip('gliderLeanL', 0.8, (t, u) => add(
      { spine1: [0, 0, 0.18], spine2: [0, 0, 0.12], hips: [0, 0, 0.1], upperLegL: [0.3, 0, -0.2], upperLegR: [0.1, 0, -0.1], lowerLegL: [-0.4, 0, 0], lowerLegR: [-0.3, 0, 0] },
      { upperArmL: [2.8, 0, -0.25], upperArmR: [2.8, 0, 0.25] },
    )),
    makeClip('gliderLeanR', 0.8, (t, u) => add(
      { spine1: [0, 0, -0.18], spine2: [0, 0, -0.12], hips: [0, 0, -0.1], upperLegL: [0.1, 0, 0.1], upperLegR: [0.3, 0, 0.2], lowerLegL: [-0.3, 0, 0], lowerLegR: [-0.4, 0, 0] },
      { upperArmL: [2.8, 0, -0.25], upperArmR: [2.8, 0, 0.25] },
    )),
    makeClip('gliderClose', 0.4, (t, u) => add(
      { upperLegL: [0.3, 0, 0], lowerLegL: [-0.5, 0, 0], upperLegR: [0.1, 0, 0], lowerLegR: [-0.4, 0, 0] },
      { upperArmL: [lerp(2.8, 0.4, seg(u, 0, 1)), 0, -0.2], upperArmR: [lerp(2.8, 0.4, seg(u, 0, 1)), 0, 0.2] },
    ), { loop: false }),
    // Water.
    makeClip('swim', 1.1, (t, u) => add(
      { hips: [0.9, 0, 0.05 * sn(u)], hipsPos: [0, -0.15, 0], spine1: [0.1, 0.25 * sn(u), 0], spine2: [0.1, 0.3 * sn(u), 0], head: [-0.7, 0, 0],
        upperLegL: [0.3 * sn(u, 2), 0, 0], lowerLegL: [-0.3 - 0.25 * sn(u, 2), 0, 0], upperLegR: [-0.3 * sn(u, 2), 0, 0], lowerLegR: [-0.3 + 0.25 * sn(u, 2), 0, 0] },
      { upperArmL: [2.9 * Math.max(0, 0.5 + 0.5 * sn(u, 1, 0)) - 0.2, 0, -0.3], upperArmR: [2.9 * Math.max(0, 0.5 + 0.5 * sn(u, 1, Math.PI)) - 0.2, 0, 0.3],
        lowerArmL: [0.4 + 0.4 * cs(u), 0, 0], lowerArmR: [0.4 - 0.4 * cs(u), 0, 0] },
    )),
    makeClip('tread', 2.0, (t, u) => add(
      { hipsPos: [0, -0.1 + 0.03 * sn(u, 2), 0], upperLegL: [0.4 + 0.25 * sn(u), 0, -0.1], lowerLegL: [-0.8, 0, 0], upperLegR: [0.4 - 0.25 * sn(u), 0, 0.1], lowerLegR: [-0.8, 0, 0] },
      { upperArmL: [0.2, 0, -0.9 + 0.25 * sn(u)], upperArmR: [0.2, 0, 0.9 - 0.25 * sn(u)], lowerArmL: [0.6, 0, 0], lowerArmR: [0.6, 0, 0] },
    )),
  ];
}
