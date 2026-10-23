// Turns sim state into poses. Two layers run on one AnimationMixer: the legs and
// pelvis follow locomotion, the torso, head and arms follow whatever the player
// is doing (weapon, pickaxe, building, healing, emoting). Hit reactions and gun
// recoil play additively on top. Everything is derived from sim state, so a
// remote fighter animates correctly from snapshots alone.
import * as THREE from 'three';
import { WEAPONS, CONSUMABLES } from '/shared/config.js';
import { getClips, classOfWeapon } from './anims/index.js';
import { LOWER, UPPER, onlyBones } from './anims/pose.js';

const FADE = 0.18;
const layerClips = new Map(); // `${name}|lower` -> filtered clip, shared by every character

function layerClip(name, set, tag) {
  const key = `${name}|${tag}`;
  let c = layerClips.get(key);
  if (!c) {
    c = onlyBones(getClips().get(name), set, `|${tag}`);
    layerClips.set(key, c);
  }
  return c;
}

class Layer {
  constructor(mixer, set, tag) {
    this.mixer = mixer;
    this.set = set;
    this.tag = tag;
    this.name = '';
    this.action = null;
  }

  // Cross-fade to `name`. Same clip: just retime. restart plays a one-shot again.
  play(name, { timeScale = 1, fade = FADE, restart = false } = {}) {
    if (name === this.name && !restart) {
      if (this.action) this.action.timeScale = timeScale;
      return this.action;
    }
    const clip = getClips().get(name);
    const next = this.mixer.clipAction(layerClip(name, this.set, this.tag));
    next.enabled = true;
    next.reset();
    next.timeScale = timeScale;
    const loop = clip.userData.loop !== false;
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    next.setEffectiveWeight(1);
    if (this.action) {
      if (this.action !== next) this.action.fadeOut(fade);
      next.fadeIn(fade);
    }
    next.play();
    this.action = next;
    this.name = name;
    return next;
  }

  get finished() {
    return !this.action || (this.action.loop === THREE.LoopOnce && this.action.time >= this.action.getClip().duration - 0.001);
  }
}

const TERRAIN_FOOT_BLEND = 0.2;

export class Animator {
  // groundAt(x, z) is optional: it lets planted feet follow slopes.
  constructor(rig, groundAt = null) {
    this.rig = rig;
    this.groundAt = groundAt;
    this.mixer = new THREE.AnimationMixer(rig.mesh);
    this.lower = new Layer(this.mixer, LOWER, 'lower');
    this.upper = new Layer(this.mixer, UPPER, 'upper');
    this.overlays = new Map();
    this.prev = { selected: -1, fireFx: 0, hitFx: 0, placeFx: 0, swingT: 0, onGround: true, vy: 0, emote: 0, wasAir: false };
    this.swingIndex = 0;
    this.fidgetAt = 5 + Math.random() * 5;
    this.idleFor = 0;
    this.oneShotUntil = 0;
    this.equipUntil = 0;
    this.time = 0;
    this.lean = 0;
    this.expression = 'neutral';
    this.exprUntil = 0;
    this.initial = true;
    this.hipRest = rig.bones.hips.position.clone();
  }

  overlay(name, timeScale = 1) {
    const clip = getClips().get(name);
    let a = this.overlays.get(name);
    if (!a) {
      a = this.mixer.clipAction(clip);
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = false;
      a.blendMode = THREE.AdditiveAnimationBlendMode;
      this.overlays.set(name, a);
    }
    a.reset();
    a.timeScale = timeScale;
    a.setEffectiveWeight(1);
    a.play();
  }

  // ---------------------------------------------------------------- state

  choose(f) {
    const vx = f.vel.x, vz = f.vel.z;
    const speed = Math.hypot(vx, vz);
    // Velocity in the character's own frame (forward = -Z rotated by yaw).
    const sin = Math.sin(f.yaw), cos = Math.cos(f.yaw);
    const fwd = -(vx * sin + vz * cos);
    const right = vx * cos - vz * sin;
    const w = f.weapon;
    const cls = w ? classOfWeapon[w.type] : null;
    const out = { speed, fwd, right, cls, lower: 'idle', lowerScale: 1, upper: null, upperScale: 1, tilt: 0, full: null };

    // Emotes own the whole body.
    if (f.emote > 0 && f.alive) { out.full = `emote.${f.emote}`; return out; }

    if (f.state === 'skydive') {
      out.full = f.vel.y < -34 || f.dive ? 'skydiveDive' : 'skydiveFlat';
      out.tilt = f.vel.y < -34 || f.dive ? -1.45 : -1.15;
      return out;
    }
    if (f.state === 'glide') {
      const lat = right / 14;
      out.full = lat > 0.2 ? 'gliderLeanR' : lat < -0.2 ? 'gliderLeanL' : 'gliderLoop';
      return out;
    }
    if (f.swimming) {
      out.full = speed > 0.6 ? 'swim' : 'tread';
      out.tilt = speed > 0.6 ? 0 : 0;
      return out;
    }
    if (!f.onGround) {
      out.lower = f.vel.y < -3 ? 'fallLoop' : 'jumpLoop';
    } else if (f.crouch) {
      out.lower = speed > 0.4 ? 'crouchWalk' : 'crouchIdle';
      out.lowerScale = speed > 0.4 ? Math.min(1.6, speed / 2.2) : 1;
    } else if (speed < 0.35) {
      out.lower = 'idle';
    } else if (fwd < -0.6 * speed && speed > 0.8) {
      out.lower = 'backpedal'; out.lowerScale = Math.min(1.5, speed / 3.5);
    } else if (Math.abs(right) > Math.abs(fwd) * 0.8 && speed > 0.8) {
      out.lower = right > 0 ? 'strafeR' : 'strafeL'; out.lowerScale = Math.min(1.5, speed / 4.5);
    } else if (speed < 3.8) {
      out.lower = 'walk'; out.lowerScale = Math.min(1.6, speed / 2.6);
    } else if (speed < 6.6) {
      out.lower = 'jog'; out.lowerScale = Math.min(1.4, speed / 5.3);
    } else {
      out.lower = 'sprint'; out.lowerScale = Math.min(1.3, speed / 7.4);
    }

    // Upper body: healing, building, weapon, pickaxe, or just locomotion arms.
    const moving = speed > 1.2;
    if (f.heal || f.animHeal) {
      const type = f.heal ? f.heal.type : null;
      out.upper = type === 'bandage' ? 'heal.bandage' : type === 'medkit' ? 'heal.medkit' : type === 'minis' ? 'heal.sip' : type === 'bigpot' ? 'heal.drink' : type === 'chug' ? 'heal.jug' : 'heal.drink';
      const total = f.heal ? f.heal.total : 3;
      out.upperScale = (getClips().get(out.upper).duration) / Math.max(0.5, total);
    } else if (f.editMode) out.upper = 'edit.stance';
    else if (f.buildMode) out.upper = moving ? 'build.move' : 'build.stance';
    else if (f.selected === 0) out.upper = moving ? 'pickaxe.move' : 'pickaxe.idle';
    else if (cls) {
      if ((f.reloadT > 0 || f.animReload) && cls) {
        out.upper = `${cls}.reload`;
        const spec = WEAPONS[w.type];
        const t = f.reloadT > 0 ? spec.reload[w.rarity] : 2.4;
        out.upperScale = 2.4 / t;
      } else out.upper = f.ads ? `${cls}.ads` : moving ? `${cls}.move` : `${cls}.idle`;
    } else if (f.item && f.item.kind === 'consumable') out.upper = moving ? 'consumable.move' : 'consumable.idle';
    return out;
  }

  // ---------------------------------------------------------------- frame

  update(dt, f, lodLevel = 0) {
    this.time += dt;
    const c = this.choose(f);
    const p = this.prev;
    const rig = this.rig;

    if (c.full) {
      this.lower.play(c.full, { timeScale: 1 });
      this.upper.play(c.full, { timeScale: 1 });
    } else {
      // Landing squash, then back to locomotion.
      if (p.wasAir && f.onGround) {
        const hard = p.vy < -13;
        this.lower.play(hard ? 'landHard' : 'landSoft', { restart: true, fade: 0.05 });
        this.oneShotUntil = this.time + (hard ? 0.6 : 0.3);
      } else if (!f.onGround && p.onGround && f.vel.y > 4) {
        this.lower.play('jumpStart', { restart: true, fade: 0.05 });
        this.oneShotUntil = this.time + 0.25;
      }
      if (this.time >= this.oneShotUntil) {
        if (c.lower === 'idle') {
          this.idleFor += dt;
          if (this.idleFor > this.fidgetAt && this.lower.name === 'idle') {
            this.lower.play(Math.random() < 0.5 ? 'idleFidget1' : 'idleFidget2', { restart: true });
            this.fidgetAt = 6 + Math.random() * 8;
            this.idleFor = 0;
            this.oneShotUntil = this.time + 4;
          } else if (!this.lower.name.startsWith('idleFidget')) this.lower.play('idle');
        } else {
          this.idleFor = 0;
          this.lower.play(c.lower, { timeScale: c.lowerScale });
        }
      }
      const upperName = c.upper || c.lower;
      // Swinging the pickaxe: pick the next of three swings on each new swing.
      if (f.selected === 0 && f.swingT > 0 && p.swingT <= 0 && !f.buildMode) {
        this.swingIndex = (this.swingIndex % 3) + 1;
        this.upper.play(`pickaxe.swing${this.swingIndex}`, { restart: true, fade: 0.05 });
        this.equipUntil = this.time + 0.4;
      } else if (this.time >= this.equipUntil) {
        if (f.selected !== p.selected && c.upper && !f.heal) {
          const eq = c.cls ? `${c.cls}.equip` : f.selected === 0 ? 'pickaxe.equip' : null;
          if (eq) { this.upper.play(eq, { restart: true, fade: 0.05 }); this.equipUntil = this.time + 0.32; }
        } else if (c.upper) this.upper.play(upperName, { timeScale: c.upperScale });
        else this.upper.play(upperName, { timeScale: c.lowerScale });
      }
    }

    // Additive overlays on rising edges.
    if (f.fireFx > 0 && p.fireFx <= 0 && c.cls) this.overlay(`${c.cls}.fire`);
    if (f.placeFx > 0 && p.placeFx <= 0 && f.buildMode) this.overlay('build.place');
    if (f.hitFx > 0 && p.hitFx <= 0) {
      const a = f.hitDir;
      const name = f.hitHead ? 'hit.head' : a < Math.PI / 4 || a > Math.PI * 1.75 ? 'hit.front' : a < Math.PI * 0.75 ? 'hit.left' : a < Math.PI * 1.25 ? 'hit.back' : 'hit.right';
      this.overlay(name);
      this.expression = 'hurt';
      this.exprUntil = this.time + 0.5;
    }

    p.selected = f.selected; p.fireFx = f.fireFx; p.hitFx = f.hitFx; p.placeFx = f.placeFx; p.swingT = f.swingT;
    p.wasAir = !f.onGround && f.state === 'ground';
    p.onGround = f.onGround; p.vy = f.vel.y;

    // Face.
    let expr = this.time < this.exprUntil ? this.expression : 'neutral';
    if (expr === 'neutral') {
      if (f.emote === 13 || f.emote === 18 || f.emote === 22) expr = 'cheer';
      else if (f.ads) expr = 'aim';
      else if (f.state === 'skydive' || c.lower === 'sprint' || f.reloadT > 0 || f.heal) expr = 'effort';
    }
    rig.face.set(expr);

    this.mixer.update(dt);

    // Body pitch for skydiving (belly down), eased.
    const tgt = c.tilt;
    rig.tilt.rotation.x += (tgt - rig.tilt.rotation.x) * Math.min(1, dt * 6);
    rig.tilt.position.y = -Math.sin(rig.tilt.rotation.x) * 0.0 + (rig.tilt.rotation.x < -0.2 ? 1.0 * Math.min(1, -rig.tilt.rotation.x) : 0);

    // Aim offset: bend the torso and lift the arms with the camera pitch.
    if (f.alive && !c.full && (c.cls || f.selected === 0 || f.buildMode)) {
      const pitch = Math.max(-1.2, Math.min(1.2, f.pitch));
      if (c.cls) {
        const b = rig.bones;
        b.spine2.rotation.x += pitch * 0.18;
        b.spine3.rotation.x += pitch * 0.14;
        b.head.rotation.x += pitch * 0.25;
        b.upperArmR.rotation.x += pitch * 0.55;
        b.upperArmL.rotation.x += pitch * 0.55;
      } else {
        rig.bones.head.rotation.x += Math.max(-0.6, Math.min(0.6, f.pitch)) * 0.4;
      }
    }

    // Planted feet follow the ground. Only worth doing for characters close up.
    if (lodLevel === 0 && this.groundAt && f.onGround && !c.full && f.alive) this.groundFeet(f);
  }

  // Two-bone IK per leg so planted feet sit on slopes instead of floating.
  groundFeet(f) {
    const rig = this.rig;
    rig.root.updateMatrixWorld(true);
    const rootGround = this.groundAt(f.pos.x, f.pos.z, f.pos.y);
    for (const side of ['L', 'R']) {
      const upper = rig.bones[`upperLeg${side}`], lower = rig.bones[`lowerLeg${side}`], foot = rig.bones[`foot${side}`];
      foot.getWorldPosition(this._v1 ||= new THREE.Vector3());
      const fp = this._v1;
      const delta = this.groundAt(fp.x, fp.z, f.pos.y) - rootGround;
      const above = fp.y - (f.pos.y + 0.03);
      const w = 1 - Math.max(0, Math.min(1, (above - 0.04) / TERRAIN_FOOT_BLEND));
      if (w < 0.05 || Math.abs(delta) < 0.02) continue;
      this.solveLeg(upper, lower, foot, fp.clone().add(new THREE.Vector3(0, delta * w, 0)), f.yaw);
    }
  }

  solveLeg(upper, lower, foot, target, yaw) {
    const a = 0.43, b = 0.42;
    const H = upper.getWorldPosition(new THREE.Vector3());
    const toT = target.clone().sub(H);
    const d = Math.max(Math.abs(a - b) + 0.02, Math.min(a + b - 0.01, toT.length()));
    toT.normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const pole = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); // knees point forward
    const perp = pole.sub(toT.clone().multiplyScalar(pole.dot(toT))).normalize();
    const thigh = toT.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(perp, Math.sin(alpha)).normalize();
    const knee = H.clone().addScaledVector(thigh, a);
    const shin = target.clone().sub(knee).normalize();
    const down = new THREE.Vector3(0, -1, 0);
    const qUp = new THREE.Quaternion().setFromUnitVectors(down, thigh);
    const qLow = new THREE.Quaternion().setFromUnitVectors(down, shin);
    const pq = upper.parent.getWorldQuaternion(new THREE.Quaternion());
    upper.quaternion.copy(pq.clone().invert().multiply(qUp));
    lower.quaternion.copy(qUp.clone().invert().multiply(qLow));
    const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    foot.quaternion.copy(qLow.clone().invert().multiply(flat));
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.rig.mesh);
  }
}

void CONSUMABLES;
