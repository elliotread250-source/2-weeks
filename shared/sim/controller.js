// Turns one input command into fighter state for one tick. This is the only
// path from a human's keyboard to the simulation, so the same code runs in the
// browser (offline and, later, for prediction) and on the server.
import { PLAYER, WEAPONS, BUILD_COST, MAT_ORDER, INTERACT } from '../config.js';
import { Vec3 } from '../math/vec3.js';
import { itemRarity } from './loot.js';

// Buttons currently held.
export const HELD = {
  FIRE: 1, AIM: 2, JUMP: 4, SPRINT: 8, INTERACT: 16, FORWARD: 32, CONFIRM_RELEASE: 64,
};
// Edge events since the previous command (pressed this tick, never lost).
export const ACT = {
  JUMP: 1, FIRE: 2, FIRE_UP: 4, INTERACT: 8, RELOAD: 16, BUILD: 32, EDIT: 64, EDIT_RESET: 128, AIM: 256, MAT: 512,
};
export const PIECES = ['wall', 'floor', 'ramp', 'cone'];

export function emptyCommand() {
  return { seq: 0, mx: 0, mz: 0, yaw: 0, pitch: 0, held: 0, act: 0, slot: -1, slotStep: 0, piece: -1, matStep: 0, viewTick: 0 };
}

const nextMat = (m, step = 1) => MAT_ORDER[(MAT_ORDER.indexOf(m) + step + MAT_ORDER.length) % MAT_ORDER.length];

export function applyCommand(match, f, cmd, dt) {
  const act = (b) => (cmd.act & b) !== 0;
  const held = (b) => (cmd.held & b) !== 0;
  const builds = match.builds;

  f.yaw = cmd.yaw;
  f.pitch = cmd.pitch;

  if (match.phase === 'bus' && f.state === 'bus') {
    if (act(ACT.JUMP)) match.jumpFromBus(f);
    return;
  }
  if (!f.alive) {
    resetModes(match, f);
    return;
  }

  const airborne = f.airborne;

  // ---- mode switching
  if (!airborne) {
    const leaveEdit = () => { if (f.editMode) { builds.confirmEdit(f); f.editMode = false; } };
    if (act(ACT.BUILD)) {
      leaveEdit();
      f.buildMode = !f.buildMode;
      f.heal = null;
    }
    if (cmd.piece >= 0) {
      leaveEdit();
      f.buildMode = true; f.buildPiece = PIECES[cmd.piece]; f.heal = null;
    }
    if (cmd.matStep && f.buildMode) f.buildMat = nextMat(f.buildMat, cmd.matStep);
    if (act(ACT.MAT) && f.buildMode) f.buildMat = nextMat(f.buildMat);
    if (cmd.slot >= 0) {
      leaveEdit();
      f.buildMode = false;
      f.select(cmd.slot);
    } else if (cmd.slotStep && !f.buildMode) {
      f.select((f.selected + cmd.slotStep + 6) % 6);
    }
    if (act(ACT.EDIT)) {
      if (f.editMode) {
        builds.confirmEdit(f);
        f.editMode = false;
        match.emit('sfx', { name: 'build', by: f.id, own: true, vol: 0.6 });
      } else {
        const { camPos, dir } = f.aimRay();
        const hit = match.collision.raycast(camPos, dir, 12, (c) => c.kind === 'build');
        const piece = hit && hit.collider && hit.collider.kind === 'build' ? hit.collider.owner : null;
        if (piece && piece.owner === f && hit.point && Math.hypot(hit.point.x - f.pos.x, hit.point.y - f.pos.y - 1, hit.point.z - f.pos.z) < 7) {
          builds.startEdit(f, piece);
          f.editMode = true;
          f.editClicked = false;
          f.lastTile = -1;
        }
      }
    }
  } else {
    f.buildMode = false;
  }
  if (act(ACT.RELOAD) && !f.buildMode) match.combat.tryReload(f);

  applyMovement(match, f, cmd, dt);

  // ---- actions
  f.buildCd -= dt;
  if (f.editMode) updateEdit(match, f, cmd, act, held);
  else if (f.buildMode) updateBuild(match, f, act, held);
  else if (!airborne) updateCombat(match, f, cmd, act, held);
  if (!airborne) updateInteract(match, f, act, held, dt);
  else f.chestT = 0;
}

// Look, glider opening, velocity and jumping for one tick. Split out so the
// client can replay it for prediction without touching combat or building.
export function applyMovement(match, f, cmd, dt) {
  const act = (b) => (cmd.act & b) !== 0;
  const held = (b) => (cmd.held & b) !== 0;
  f.yaw = cmd.yaw;
  f.pitch = cmd.pitch;
  if (!f.alive || f.state === 'bus') return;
  const airborne = f.airborne;
  if (f.state === 'skydive' && act(ACT.JUMP)) {
    const above = f.pos.y - match.collision.groundHeight(f.pos.x, f.pos.z, f.pos.y);
    if (above < 110) { f.state = 'glide'; match.emit('sfx', { name: 'glider', by: f.id, own: true }); }
  }
  const fwd = new Vec3(-Math.sin(cmd.yaw), 0, -Math.cos(cmd.yaw));
  const right = new Vec3(Math.cos(cmd.yaw), 0, -Math.sin(cmd.yaw));
  const wish = new Vec3().addScaledVector(fwd, cmd.mz).addScaledVector(right, cmd.mx);
  if (wish.lengthSq() > 1) wish.normalize();

  const w = f.weapon;
  f.ads = held(HELD.AIM) && !f.buildMode && !f.editMode && !!w && !airborne;
  f.scoped = f.ads && !!w && !!WEAPONS[w.type].scope;

  if (airborne) {
    const sp = f.state === 'skydive' ? PLAYER.skydiveSpeed : PLAYER.glideSpeed;
    f.vel.x += (wish.x * sp - f.vel.x) * Math.min(1, dt * 2);
    f.vel.z += (wish.z * sp - f.vel.z) * Math.min(1, dt * 2);
    f.dive = cmd.pitch < -0.6 && held(HELD.FORWARD);
  } else {
    let speed = PLAYER.runSpeed;
    const sprinting = held(HELD.SPRINT) && held(HELD.FORWARD) && !f.ads && !held(HELD.FIRE);
    if (sprinting) speed = PLAYER.sprintSpeed;
    if (f.ads) speed = PLAYER.adsSpeed;
    if (f.heal) speed = PLAYER.healSpeed;
    if (f.swimming) speed = PLAYER.swimSpeed;
    const acc = f.onGround ? 14 : 3;
    f.vel.x += (wish.x * speed - f.vel.x) * Math.min(1, acc * dt);
    f.vel.z += (wish.z * speed - f.vel.z) * Math.min(1, acc * dt);
    if (held(HELD.JUMP) && (f.onGround || f.swimming)) {
      f.vel.y = f.swimming ? PLAYER.jumpVel * 0.7 : PLAYER.jumpVel;
      f.onGround = false;
    }
  }
}

export function resetModes(match, f) {
  if (f.editing) match.builds.confirmEdit(f);
  f.resetControl();
}

function updateCombat(match, f, cmd, act, held) {
  const { origin, dir } = f.aimRay();
  if (f.selected === 0) {
    if (held(HELD.FIRE)) match.combat.swing(f, origin, dir);
    return;
  }
  const it = f.item;
  if (!it) return;
  if (it.kind === 'weapon') {
    const spec = WEAPONS[it.type];
    if ((spec.auto && held(HELD.FIRE)) || act(ACT.FIRE)) {
      match.combat.fire(f, origin, dir, { ads: f.ads, firstShotAccurate: true, rewindTick: cmd.viewTick });
    }
  } else if (it.kind === 'consumable' && act(ACT.FIRE)) {
    if (!match.combat.startHeal(f)) match.emit('message', { to: f.id, text: '', sub: "You can't use that right now", dur: 1.2 });
  }
}

function updateBuild(match, f, act, held) {
  const builds = match.builds;
  if (act(ACT.AIM)) f.buildMat = nextMat(f.buildMat);
  // Auto-switch material when the current one runs dry.
  if (f.mats[f.buildMat] < BUILD_COST) {
    const alt = MAT_ORDER.find((m) => f.mats[m] >= BUILD_COST);
    if (alt) f.buildMat = alt;
  }
  const target = builds.computeTarget(f.buildPiece, f.pos, f.yaw, f.pitch);
  const afford = f.mats[f.buildMat] >= BUILD_COST;
  const valid = afford && builds.canPlace(target);
  if (held(HELD.FIRE) && valid && f.buildCd <= 0) {
    if (builds.place(target, f.buildMat, f)) {
      f.mats[f.buildMat] -= BUILD_COST;
      match.emit('sfx', { name: 'build', by: f.id, own: true });
      f.buildCd = 0.06;
    }
  } else if (act(ACT.FIRE) && !afford) {
    match.emit('message', { to: f.id, text: '', sub: `Not enough ${f.buildMat}`, dur: 1.2 });
  }
}

function updateEdit(match, f, cmd, act, held) {
  const builds = match.builds;
  const e = f.editing;
  if (!e || e.piece.dead) { f.editMode = false; builds.confirmEdit(f); return; }
  if (act(ACT.EDIT_RESET)) {
    builds.confirmEdit(f, true);
    f.editMode = false;
    match.emit('sfx', { name: 'build', by: f.id, own: true, vol: 0.6 });
    return;
  }
  const { camPos, dir } = f.aimRay();
  const tile = builds.tileAt(e.piece, camPos, dir);
  if (act(ACT.FIRE)) {
    builds.toggleTile(f, tile, false);
    f.lastTile = tile;
    f.dragAdd = e.selected.includes(tile);
    f.editClicked = true;
  } else if (held(HELD.FIRE) && tile !== f.lastTile && tile >= 0) {
    if (f.dragAdd) builds.toggleTile(f, tile, true);
    f.lastTile = tile;
  }
  // Fortnite's "confirm edit on release": letting go of fire applies it.
  if (held(HELD.CONFIRM_RELEASE) && f.editClicked && act(ACT.FIRE_UP)) {
    builds.confirmEdit(f);
    f.editMode = false;
    f.editClicked = false;
    match.emit('sfx', { name: 'build', by: f.id, own: true, vol: 0.6 });
  }
}

// What the fighter could interact with right now. The client uses this for
// prompts; the sim uses it to act.
export function interactTarget(match, f) {
  const chest = match.loot.nearestChest(f.pos, INTERACT.chestRange);
  const pickup = match.loot.nearestPickup(f.pos, INTERACT.pickupRange, (pk) => pk.item.kind === 'weapon' || pk.item.kind === 'consumable');
  if (chest && (!pickup || chest.pos.distanceTo(f.pos) < pickup.pos.distanceTo(f.pos))) return { kind: 'chest', chest };
  if (pickup) return { kind: 'pickup', pickup, full: !f.hasRoomFor(pickup.item), rarity: itemRarity(pickup.item) };
  return null;
}

function updateInteract(match, f, act, held, dt) {
  const t = interactTarget(match, f);
  if (t && t.kind === 'chest') {
    if (held(HELD.INTERACT)) {
      f.chestT += dt;
      if (f.chestT >= INTERACT.chestHold) {
        match.loot.openChest(t.chest);
        match.emit('sfx', { name: 'chest', by: f.id, own: true });
        f.chestT = 0;
      }
    } else f.chestT = 0;
    return;
  }
  f.chestT = 0;
  if (t && t.kind === 'pickup' && act(ACT.INTERACT)) {
    if (!t.full) match.pickupItem(f, t.pickup);
    else if (f.selected > 0) {
      const old = f.slots[f.selected - 1];
      f.slots[f.selected - 1] = null;
      match.pickupItem(f, t.pickup);
      match.loot.drop(old, f.pos.clone().add(new Vec3(0, 0.8, 0)), true);
    }
  }
}

