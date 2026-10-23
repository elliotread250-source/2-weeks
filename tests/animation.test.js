import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getClips, WEAPON_CLASSES } from '../public/js/render/anims/index.js';
import { BONES } from '../public/js/render/anims/pose.js';
import { buildRig } from '../public/js/render/rig.js';
import { Animator } from '../public/js/render/animator.js';
import { OUTFITS } from '../shared/cosmetics/outfits.js';
import { EMOTE_COUNT } from '../shared/config.js';
import { Fighter } from '../shared/sim/fighter.js';

const clips = getClips();

test('every required clip group exists', () => {
  const need = [
    'idle', 'idleFidget1', 'idleFidget2', 'walk', 'jog', 'sprint', 'strafeL', 'strafeR', 'backpedal', 'crouchIdle', 'crouchWalk', 'turnL', 'turnR',
    'jumpStart', 'jumpLoop', 'fallLoop', 'landSoft', 'landHard', 'skydiveFlat', 'skydiveDive', 'gliderDeploy', 'gliderLoop', 'gliderLeanL', 'gliderLeanR', 'gliderClose',
    'swim', 'tread',
    'pickaxe.equip', 'pickaxe.idle', 'pickaxe.swing1', 'pickaxe.swing2', 'pickaxe.swing3', 'pickaxe.harvestHit',
    'build.stance', 'build.place', 'edit.stance', 'edit.confirm',
    'heal.bandage', 'heal.medkit', 'heal.sip', 'heal.drink', 'heal.jug',
    'hit.front', 'hit.back', 'hit.left', 'hit.right', 'hit.head', 'knocked.crawl', 'revive', 'eliminated',
  ];
  for (const n of need) assert.ok(clips.has(n), `missing clip ${n}`);
  assert.equal(WEAPON_CLASSES.length, 8);
  for (const cls of WEAPON_CLASSES) for (const a of ['idle', 'move', 'ads', 'fire', 'reload', 'equip']) assert.ok(clips.has(`${cls}.${a}`), `${cls}.${a}`);
});

test('25 emotes, each between 2 and 8 seconds', () => {
  for (let i = 1; i <= EMOTE_COUNT; i++) {
    const c = clips.get(`emote.${i}`);
    assert.ok(c, `emote ${i}`);
    assert.ok(c.duration >= 2 && c.duration <= 8, `emote ${i} lasts ${c.duration}s`);
  }
});

test('clips only touch real bones and contain finite numbers', () => {
  for (const c of clips.values()) {
    for (const t of c.tracks) {
      const bone = t.name.split('.')[0];
      assert.ok(BONES.includes(bone), `${c.name} animates unknown bone ${bone}`);
      for (const v of t.values) assert.ok(Number.isFinite(v), `${c.name} ${t.name} has ${v}`);
    }
  }
});

test('looping clips join up: last pose equals the first', () => {
  for (const c of clips.values()) {
    if (c.userData.loop === false) continue;
    for (const t of c.tracks) {
      if (!t.name.endsWith('quaternion')) continue;
      const n = t.values.length;
      const a = new THREE.Quaternion().fromArray(t.values, 0), b = new THREE.Quaternion().fromArray(t.values, n - 4);
      assert.ok(Math.abs(a.dot(b)) > 0.995, `${c.name} ${t.name} does not loop (dot ${a.dot(b).toFixed(3)})`);
    }
  }
});

test('the rig has a full skeleton with valid skin weights', () => {
  const rig = buildRig(OUTFITS[2]);
  assert.deepEqual(rig.skeleton.bones.map((b) => b.name), BONES);
  const g = rig.mesh.geometry;
  assert.ok(g.attributes.position.count < 24000, `${g.attributes.position.count} vertices`);
  const idx = g.attributes.skinIndex, w = g.attributes.skinWeight;
  for (let i = 0; i < idx.count; i++) {
    const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
    assert.ok(Math.abs(sum - 1) < 1e-4, 'weights sum to one');
    assert.ok(idx.getX(i) < BONES.length && idx.getY(i) < BONES.length);
  }
  for (const s of ['right', 'left', 'back', 'head']) assert.ok(rig.sockets[s]);
});

test('every default outfit builds a rig', () => {
  for (const o of OUTFITS) assert.ok(buildRig(o).mesh.isSkinnedMesh);
});

function fighter(patch = {}) {
  const f = new Fighter('t', OUTFITS[0], {});
  f.state = 'ground'; f.onGround = true; f.alive = true;
  Object.assign(f, patch);
  return f;
}
const anim = () => new Animator(buildRig(OUTFITS[0]));

test('state machine: ground speed picks idle, walk, jog and sprint', () => {
  const a = anim();
  const at = (speed) => { const f = fighter(); f.vel.set(0, 0, -speed); return a.choose(f).lower; };
  assert.equal(at(0), 'idle');
  assert.equal(at(2.5), 'walk');
  assert.equal(at(5.6), 'jog');
  assert.equal(at(7.4), 'sprint');
});

test('state machine: strafing, backpedalling, crouching, air and water', () => {
  const a = anim();
  let f = fighter(); f.vel.set(5, 0, 0); // yaw 0 faces -Z, so +X is to the right
  assert.equal(a.choose(f).lower, 'strafeR');
  f = fighter(); f.vel.set(-5, 0, 0);
  assert.equal(a.choose(f).lower, 'strafeL');
  f = fighter(); f.vel.set(0, 0, 4);
  assert.equal(a.choose(f).lower, 'backpedal');
  f = fighter({ crouch: true }); f.vel.set(0, 0, -2);
  assert.equal(a.choose(f).lower, 'crouchWalk');
  f = fighter({ onGround: false }); f.vel.set(0, -8, 0);
  assert.equal(a.choose(f).lower, 'fallLoop');
  f = fighter({ swimming: true }); f.vel.set(0, 0, -2);
  assert.equal(a.choose(f).full, 'swim');
});

test('state machine: skydive, glide, emote and upper-body activities', () => {
  const a = anim();
  assert.equal(a.choose(fighter({ state: 'skydive', onGround: false })).full, 'skydiveFlat');
  assert.equal(a.choose(fighter({ state: 'glide', onGround: false })).full, 'gliderLoop');
  assert.equal(a.choose(fighter({ emote: 4 })).full, 'emote.4');
  const rifle = fighter(); rifle.slots[0] = { kind: 'weapon', type: 'ar', rarity: 2, mag: 30 }; rifle.selected = 1;
  assert.equal(a.choose(rifle).upper, 'rifle.idle');
  rifle.ads = true;
  assert.equal(a.choose(rifle).upper, 'rifle.ads');
  rifle.ads = false; rifle.reloadT = 1;
  assert.equal(a.choose(rifle).upper, 'rifle.reload');
  assert.equal(a.choose(fighter({ buildMode: true })).upper, 'build.stance');
  assert.equal(a.choose(fighter({ selected: 0 })).upper, 'pickaxe.idle');
  assert.equal(a.choose(fighter({ heal: { type: 'chug', total: 15, t: 10 } })).upper, 'heal.jug');
});

test('leg IK reaches a target within reach', () => {
  const a = anim();
  const rig = a.rig;
  rig.root.updateMatrixWorld(true);
  const foot = rig.bones.footL;
  const start = foot.getWorldPosition(new THREE.Vector3());
  const target = start.clone().add(new THREE.Vector3(0.05, 0.12, -0.1));
  a.solveLeg(rig.bones.upperLegL, rig.bones.lowerLegL, foot, target, 0);
  rig.root.updateMatrixWorld(true);
  const got = foot.getWorldPosition(new THREE.Vector3());
  assert.ok(got.distanceTo(target) < 0.03, `foot ${got.distanceTo(target)} m from target`);
});

test('crouching and emoting travel in commands and snapshots', async () => {
  const { Match } = await import('../shared/sim/match.js');
  const { emptyCommand, HELD, applyCommand } = await import('../shared/sim/controller.js');
  const { encodeSnapshot, decodeSnapshot } = await import('../shared/net/protocol.js');
  const m = new Match({ seed: 1, botCount: 0 });
  const f = m.addHuman('me');
  f.state = 'ground'; f.onGround = true; m.phase = 'play';
  applyCommand(m, f, { ...emptyCommand(), held: HELD.CROUCH }, 1 / 30);
  assert.equal(f.crouch, true);
  applyCommand(m, f, { ...emptyCommand(), emote: 7 }, 1 / 30);
  assert.equal(f.emote, 7);
  applyCommand(m, f, { ...emptyCommand(), held: HELD.FORWARD, mz: 1, emote: -1 }, 1 / 30);
  assert.equal(f.emote, 0, 'moving cancels the emote');
  f.emote = 5;
  const snap = decodeSnapshot(encodeSnapshot({ tick: 1, ackSeq: 0, match: m, self: f, updated: [f], removed: [] }));
  assert.equal(snap.fighters[0].emote, 5);
  assert.equal(snap.fighters[0].crouch, false);
});

test('glb retarget maps Mixamo bone names to ours', async () => {
  const { ourBoneName, MIXAMO } = await import('../public/js/render/glb.js');
  assert.equal(ourBoneName('mixamorig:LeftForeArm'), 'lowerArmL');
  assert.equal(ourBoneName('mixamorigHips'), 'hips');
  assert.equal(ourBoneName('Prop_Sword'), null);
  assert.equal(Object.keys(MIXAMO).length, BONES.length);
});
