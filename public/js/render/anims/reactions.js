// Hit reactions (additive), knocked, revive and elimination.
import { makeClip, sn, cs, add, bump, seg, lerp } from './pose.js';

// Directional flinch: `dir` is the push direction on the torso [x tilt, z tilt, y twist].
const flinch = (k, [tx, tz, ty], head = 1) => ({
  hips: [tx * 0.4 * k, 0, tz * 0.4 * k], spine1: [tx * 0.5 * k, ty * 0.3 * k, tz * 0.5 * k], spine2: [tx * 0.7 * k, ty * 0.5 * k, tz * 0.6 * k],
  head: [tx * 0.9 * k * head, ty * 0.6 * k, tz * 0.8 * k * head],
  upperArmL: [-tx * 0.5 * k, 0, -0.1 * k], upperArmR: [-tx * 0.5 * k, 0, 0.1 * k],
});

export function reactionClips() {
  const hit = (name, dir, head = 1) => makeClip(name, 0.35, (t, u) => flinch(bump(u, 0, 0.2, 0.35, 1), dir, head), { loop: false });
  return [
    hit('hit.front', [-0.35, 0, 0.1]),
    hit('hit.back', [0.4, 0, -0.1]),
    hit('hit.left', [0, 0.3, -0.2]),
    hit('hit.right', [0, -0.3, 0.2]),
    makeClip('hit.head', 0.4, (t, u) => {
      const k = bump(u, 0, 0.15, 0.3, 1);
      return add(flinch(k, [0.35, 0, 0], 1.6), { neck: [-0.4 * k, 0, 0] });
    }, { loop: false }),
    // Knocked (down but not out): crawl on the belly.
    makeClip('knocked.crawl', 1.4, (t, u) => add(
      { hips: [1.35, 0, 0.06 * sn(u)], hipsPos: [0, -0.5, 0.1], spine1: [-0.45, 0.2 * sn(u), 0], spine2: [-0.3, 0.25 * sn(u), 0], head: [-0.6, 0, 0],
        upperLegL: [0.4 * sn(u), 0, 0], lowerLegL: [-0.4 - 0.3 * sn(u), 0, 0], upperLegR: [-0.4 * sn(u), 0, 0], lowerLegR: [-0.4 + 0.3 * sn(u), 0, 0] },
      { upperArmL: [2.3 * seg(sn(u, 1, 0) * 0.5 + 0.5, 0, 1) - 0.4, 0, -0.5], upperArmR: [2.3 * seg(sn(u, 1, Math.PI) * 0.5 + 0.5, 0, 1) - 0.4, 0, 0.5],
        lowerArmL: [0.6 + 0.4 * cs(u), 0, 0], lowerArmR: [0.6 - 0.4 * cs(u), 0, 0] },
    )),
    makeClip('knocked.idle', 2.0, (t, u) => ({
      hips: [1.35, 0, 0], hipsPos: [0, -0.5, 0.1], spine1: [-0.45, 0, 0], head: [-0.7 + 0.03 * sn(u), 0, 0],
      upperArmL: [1.2, 0, -0.6], upperArmR: [1.2, 0, 0.6], lowerArmL: [0.4, 0, 0], lowerArmR: [0.4, 0, 0],
      upperLegL: [0.1, 0, -0.15], upperLegR: [0.1, 0, 0.15],
    })),
    makeClip('revive', 1.4, (t, u) => {
      const down = 1 - seg(u, 0, 0.8);
      const up = seg(u, 0, 0.9);
      return add(
        { hips: [1.35 * down, 0, 0], hipsPos: [0, -0.5 * down, 0.1 * down], spine1: [-0.45 * down, 0, 0], head: [-0.7 * down, 0, 0],
          upperLegL: [lerp(0.1, 0, up), 0, 0], upperLegR: [lerp(0.1, 0, up), 0, 0] },
        { upperArmL: [lerp(1.2, 0, up), 0, -0.3], upperArmR: [lerp(1.2, 0, up), 0, 0.3] },
      );
    }, { loop: false }),
    // The teammate kneeling beside someone: hands pressing down.
    makeClip('reviving', 1.2, (t, u) => ({
      hipsPos: [0, -0.38, 0], upperLegL: [1.35, 0, 0], lowerLegL: [-2.3, 0, 0], upperLegR: [0.9, 0, 0], lowerLegR: [-1.5, 0, 0],
      spine1: [0.3, 0, 0], spine2: [0.3, 0, 0], head: [0.2, 0, 0],
      upperArmL: [1.4 + 0.15 * sn(u, 2), 0, -0.15], upperArmR: [1.4 - 0.15 * sn(u, 2), 0, 0.15], lowerArmL: [0.15, 0, 0], lowerArmR: [0.15, 0, 0],
    })),
    makeClip('eliminated', 1.0, (t, u) => {
      const f = seg(u, 0, 0.7);
      return add(
        { hips: [-1.4 * f, 0, 0.1 * f], hipsPos: [0, -0.6 * f, 0.2 * f], head: [0.3 * f, 0, 0.2 * f], upperLegL: [-0.2 * f, 0, -0.2 * f], upperLegR: [0.2 * f, 0, 0.3 * f] },
        { upperArmL: [-0.4 * f, 0, -1.0 * f], upperArmR: [-0.2 * f, 0, 0.9 * f] },
      );
    }, { loop: false }),
  ];
}
