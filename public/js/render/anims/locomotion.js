// Walking, running, strafing, crouching, turning and idling.
import { makeClip, sn, cs, add, mirror, bump, seg } from './pose.js';

// One leg+arm cycle. phase offsets the right side by half a cycle.
function cycle(u, { leg, knee, arm, elbow, twist, bob, lean = 0, sway = 0, crouch = 0 }) {
  const l = sn(u), r = sn(u, 1, Math.PI);
  const kneeL = knee * (0.5 - 0.5 * cs(u, 1, 0.9)), kneeR = knee * (0.5 - 0.5 * cs(u, 1, 0.9 + Math.PI));
  return {
    hips: [lean, twist * sn(u, 1, 0.3) * -1, sway * sn(u)],
    hipsPos: [0, -crouch + bob * cs(u, 2), 0],
    spine1: [-lean * 0.4, twist * 0.5 * sn(u, 1, 0.3), 0],
    spine2: [-lean * 0.6, twist * 0.8 * sn(u, 1, 0.3), 0],
    upperLegL: [leg * l + crouch * 1.2, 0, 0], lowerLegL: [-kneeL - crouch * 1.5, 0, 0], footL: [kneeL * 0.35 + crouch * 0.3, 0, 0],
    upperLegR: [leg * r + crouch * 1.2, 0, 0], lowerLegR: [-kneeR - crouch * 1.5, 0, 0], footR: [kneeR * 0.35 + crouch * 0.3, 0, 0],
    upperArmL: [-arm * l, 0, -0.08], lowerArmL: [elbow + 0.15 * (1 + l), 0, 0],
    upperArmR: [-arm * r, 0, 0.08], lowerArmR: [elbow + 0.15 * (1 + r), 0, 0],
    head: [-lean * 0.8, -twist * sn(u, 1, 0.3), 0],
  };
}

const breath = (u) => ({
  spine3: [0.015 * sn(u), 0, 0], spine2: [0.01 * sn(u, 1, 0.4), 0, 0],
  upperArmL: [0, 0, -0.02 * sn(u)], upperArmR: [0, 0, 0.02 * sn(u)],
});

export function locomotionClips() {
  const idleBase = (u) => add(breath(u), {
    hipsPos: [0.012 * sn(u, 1, 0.5), -0.006 * (1 + sn(u, 2)), 0],
    hips: [0, 0, 0.02 * sn(u, 1, 0.5)],
    upperLegL: [0.02, 0, -0.02], upperLegR: [-0.01, 0, 0.02],
    upperArmL: [0.05, 0, -0.1], upperArmR: [0.05, 0, 0.1],
    lowerArmL: [0.2, 0, 0], lowerArmR: [0.2, 0, 0], head: [0, 0.02 * sn(u), 0],
  });
  const clips = [
    makeClip('idle', 3.2, (t, u) => idleBase(u)),
    makeClip('idleFidget1', 4, (t, u) => add(idleBase(u), {
      head: [0, 0.5 * bump(u, 0.15, 0.3, 0.5, 0.65) - 0.4 * bump(u, 0.65, 0.78, 0.88, 0.98), 0.0],
      spine3: [0, 0.25 * bump(u, 0.15, 0.3, 0.5, 0.65), 0],
    }), { loop: false }),
    makeClip('idleFidget2', 4, (t, u) => add(idleBase(u), {
      upperArmR: [-0.9 * bump(u, 0.2, 0.35, 0.65, 0.8), 0, 0], lowerArmR: [1.6 * bump(u, 0.2, 0.35, 0.65, 0.8), 0, 0],
      head: [0.2 * bump(u, 0.2, 0.35, 0.65, 0.8), 0, 0],
      hips: [0, 0, 0.04 * bump(u, 0.1, 0.3, 0.7, 0.9)],
    }), { loop: false }),
    makeClip('walk', 1.1, (t, u) => cycle(u, { leg: 0.5, knee: 0.55, arm: 0.35, elbow: 0.25, twist: 0.12, bob: 0.02 })),
    makeClip('jog', 0.72, (t, u) => cycle(u, { leg: 0.85, knee: 1.1, arm: 0.7, elbow: 1.0, twist: 0.2, bob: 0.04, lean: 0.12, sway: 0.03 })),
    makeClip('sprint', 0.56, (t, u) => cycle(u, { leg: 1.05, knee: 1.5, arm: 0.95, elbow: 1.3, twist: 0.28, bob: 0.06, lean: 0.3, sway: 0.04 })),
    makeClip('backpedal', 0.8, (t, u) => add(cycle(u, { leg: -0.45, knee: 0.7, arm: 0.25, elbow: 0.3, twist: 0.1, bob: 0.02 }), { hips: [-0.06, 0, 0] })),
    makeClip('strafeL', 0.7, (t, u) => add(cycle(u, { leg: 0.35, knee: 0.7, arm: 0.2, elbow: 0.4, twist: 0.05, bob: 0.03 }), {
      hips: [0, 0.35, 0.05], upperLegL: [0, 0, -0.18 * sn(u, 1, 0.5)], upperLegR: [0, 0, 0.18 * sn(u, 1, 0.5)],
    })),
    makeClip('strafeR', 0.7, (t, u) => add(cycle(u, { leg: 0.35, knee: 0.7, arm: 0.2, elbow: 0.4, twist: 0.05, bob: 0.03 }), {
      hips: [0, -0.35, -0.05], upperLegL: [0, 0, 0.18 * sn(u, 1, 0.5)], upperLegR: [0, 0, -0.18 * sn(u, 1, 0.5)],
    })),
    makeClip('crouchIdle', 3, (t, u) => add(idleBase(u), {
      hipsPos: [0, -0.34, 0.03], hips: [0.1, 0, 0],
      upperLegL: [1.15, 0, 0], lowerLegL: [-1.7, 0, 0], footL: [0.5, 0, 0],
      upperLegR: [1.05, 0, 0], lowerLegR: [-1.6, 0, 0], footR: [0.5, 0, 0],
      spine1: [0.25, 0, 0], spine2: [0.2, 0, 0], head: [-0.3, 0, 0],
    })),
    makeClip('crouchWalk', 1.0, (t, u) => add(cycle(u, { leg: 0.4, knee: 0.5, arm: 0.2, elbow: 0.3, twist: 0.08, bob: 0.015, crouch: 0.3 }), {
      spine1: [0.2, 0, 0], spine2: [0.15, 0, 0], head: [-0.25, 0, 0],
    })),
    makeClip('turnL', 0.5, (t, u) => add(idleBase(u), {
      hips: [0, 0.5 * bump(u, 0, 0.25, 0.7, 1), 0],
      upperLegL: [0.3 * sn(u * 0.5, 1), 0, 0], lowerLegL: [-0.35 * bump(u, 0, 0.3, 0.5, 0.9), 0, 0],
      upperLegR: [-0.2 * bump(u, 0, 0.3, 0.6, 1), 0, 0],
    }), { loop: false }),
  ];
  const turnL = clips.find((c) => c.name === 'turnL');
  void turnL;
  clips.push(makeClip('turnR', 0.5, (t, u) => add(idleBase(u), {
    hips: [0, -0.5 * bump(u, 0, 0.25, 0.7, 1), 0],
    upperLegR: [0.3 * sn(u * 0.5, 1), 0, 0], lowerLegR: [-0.35 * bump(u, 0, 0.3, 0.5, 0.9), 0, 0],
    upperLegL: [-0.2 * bump(u, 0, 0.3, 0.6, 1), 0, 0],
  }), { loop: false }));
  return clips;
}

export { mirror, seg };
