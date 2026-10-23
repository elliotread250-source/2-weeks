// Fighter state shared by humans and bots: health, shield, inventory, ammo,
// materials and the per-player control state (build mode, edit session...).
// No rendering. Positions are plain Vec3s the renderer reads and interpolates.
import { PLAYER, CONSUMABLES, MAX_MATS, AMMO } from '../config.js';
import { Vec3 } from '../math/vec3.js';

let fighterId = 1;

// Camera rig numbers. The server rebuilds the same camera ray the client's
// camera uses so aiming agrees on both ends (camera collision is ignored).
const CAM = {
  ground: { dist: 3.4, shoulder: 0.75 },
  ads: { dist: 1.9, shoulder: 0.62 },
  build: { dist: 3.8, shoulder: 0.75 },
};

export class Fighter {
  constructor(name, outfit, { human = false, loadout = null } = {}) {
    this.id = fighterId++;
    this.name = name;
    this.human = human; // driven by input commands (a bot is driven by its brain)
    this.outfit = outfit; // resolved recipe (palette + parts)
    this.loadout = loadout; // cosmetic ids: pickaxe, glider, contrail, wrap, emotes...
    this.pos = new Vec3();
    this.vel = new Vec3();
    this.prev = { x: 0, y: 0, z: 0, yaw: 0 }; // last tick, for render interpolation
    this.smooth = { x: 0, y: 0, z: 0 }; // client-only offset easing out prediction corrections
    this.invulnUntil = 0; // match time; set while a disconnected player waits to reconnect
    this.radius = PLAYER.radius;
    this.height = PLAYER.height;
    this.reset();
    this.kills = 0;
    this.damageDealt = 0;
    // Counters the economy and challenges read after the match.
    this.stats = { assists: 0, headshots: 0, chests: 0, harvested: 0, built: 0 };
    this.diedAt = 0; // match time of final elimination (or the win)
    this.eliminated = false;
  }

  reset() {
    this.hp = PLAYER.maxHealth;
    this.shield = PLAYER.maxShield;
    this.alive = true;
    this.state = 'bus';
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.slots = [null, null, null, null, null];
    this.selected = 0; // 0 = pickaxe, 1..5 = slots
    this.ammo = { light: 0, medium: 0, heavy: 0, shells: 0, rockets: 0 };
    this.mats = { wood: 0, brick: 0, metal: 0 };
    this.fireCd = 0;
    this.reloadT = 0;
    this.bloom = 0;
    this.heal = null;
    this.swingT = 0;
    this.pendingSwing = null;
    this.flash = 0;
    this.lastHitBy = null;
    this.contrib = new Map(); // attacker id -> damage dealt to me, for assists
    this.resetControl();
  }

  // Input-driven mode state. Reset on respawn and elimination.
  resetControl() {
    this.buildMode = false;
    this.editMode = false;
    this.editing = null;
    this.buildPiece = 'wall';
    this.buildMat = 'wood';
    this.buildCd = 0;
    this.ads = false;
    this.scoped = false;
    this.chestT = 0;
    this.lastTile = -1;
    this.dragAdd = false;
    this.editClicked = false;
    this.dive = false;
    this.shoulder = 1; // camera side: +1 right shoulder, -1 left
    this.crouch = false;
    this.emote = 0; // 0 = none, 1..EMOTE_COUNT
    this.emoteT = 0;
    this.emoteCd = 0;
    // Short timers the animator reads (they also ride in snapshots as flags).
    this.fireFx = 0;
    this.hitFx = 0;
    this.hitDir = 0;
    this.placeFx = 0;
  }

  get item() {
    return this.selected === 0 ? null : this.slots[this.selected - 1];
  }

  get weapon() {
    const it = this.item;
    return it && it.kind === 'weapon' ? it : null;
  }

  get airborne() {
    return this.state === 'skydive' || this.state === 'glide';
  }

  // Where the camera sits for this fighter's current look direction and mode.
  cameraRig() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new Vec3(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    const right = new Vec3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const rig = this.ads ? CAM.ads : (this.buildMode || this.editMode) ? CAM.build : CAM.ground;
    return { dir, right, ...rig, shoulder: rig.shoulder * this.shoulder };
  }

  // Ray through the crosshair, pushed forward to the fighter's depth so a shot
  // never hits something between the camera and the character.
  aimRay() {
    const { dir, right, dist, shoulder } = this.cameraRig();
    const pivot = this.pos.clone().add(new Vec3(0, 1.6, 0));
    const cam = this.pos.clone().add(new Vec3(0, 1.65, 0)).addScaledVector(right, shoulder).addScaledVector(dir, -dist).add(new Vec3(0, 0.25, 0));
    const t0 = Math.max(0, pivot.clone().sub(cam).dot(dir));
    return { origin: cam.clone().addScaledVector(dir, t0), dir, camPos: cam };
  }

  // Hit volumes at `pos` (defaults to now). Lag compensation passes a past
  // position and whether the fighter was airborne then.
  hitboxes(p = this.pos, airborne = this.airborne) {
    if (!airborne && this.crouch) {
      const h = PLAYER.crouchHeight;
      return {
        body: { min: { x: p.x - 0.42, y: p.y, z: p.z - 0.42 }, max: { x: p.x + 0.42, y: p.y + h * 0.75, z: p.z + 0.42 } },
        head: { min: { x: p.x - 0.26, y: p.y + h * 0.75, z: p.z - 0.26 }, max: { x: p.x + 0.26, y: p.y + h + 0.2, z: p.z + 0.26 } },
      };
    }
    if (airborne) {
      return { body: { min: { x: p.x - 0.6, y: p.y + 0.3, z: p.z - 0.6 }, max: { x: p.x + 0.6, y: p.y + 1.5, z: p.z + 0.6 } }, head: null };
    }
    return {
      body: { min: { x: p.x - 0.42, y: p.y, z: p.z - 0.42 }, max: { x: p.x + 0.42, y: p.y + 1.48, z: p.z + 0.42 } },
      head: { min: { x: p.x - 0.26, y: p.y + 1.48, z: p.z - 0.26 }, max: { x: p.x + 0.26, y: p.y + 1.98, z: p.z + 0.26 } },
    };
  }

  // Add an item. Returns whatever could not be taken (or null).
  give(item) {
    if (item.kind === 'ammo') {
      const max = AMMO[item.type].max;
      this.ammo[item.type] = Math.min(max, this.ammo[item.type] + item.count);
      return null;
    }
    if (item.kind === 'mat') {
      this.mats[item.type] = Math.min(MAX_MATS, this.mats[item.type] + item.count);
      return null;
    }
    if (item.kind === 'consumable') {
      const spec = CONSUMABLES[item.type];
      let left = item.count;
      for (const s of this.slots) {
        if (s && s.kind === 'consumable' && s.type === item.type && s.count < spec.stack) {
          const n = Math.min(left, spec.stack - s.count);
          s.count += n;
          left -= n;
          if (!left) return null;
        }
      }
      const empty = this.slots.indexOf(null);
      if (empty >= 0) {
        this.slots[empty] = { ...item, count: Math.min(left, spec.stack) };
        left -= Math.min(left, spec.stack);
        return left > 0 ? { ...item, count: left } : null;
      }
      return { ...item, count: left };
    }
    const empty = this.slots.indexOf(null);
    if (empty >= 0) {
      this.slots[empty] = item;
      return null;
    }
    return item;
  }

  hasRoomFor(item) {
    if (item.kind === 'ammo' || item.kind === 'mat') return true;
    if (this.slots.includes(null)) return true;
    if (item.kind === 'consumable') {
      const spec = CONSUMABLES[item.type];
      return this.slots.some((s) => s && s.kind === 'consumable' && s.type === item.type && s.count < spec.stack);
    }
    return false;
  }

  select(i) {
    if (i === this.selected) return;
    this.selected = i;
    this.reloadT = 0;
    this.heal = null;
    this.fireCd = Math.max(this.fireCd, 0.25); // equip time
  }

  // Everything this fighter drops when eliminated.
  dropAll() {
    const out = [];
    for (const s of this.slots) if (s) out.push(s);
    for (const [k, v] of Object.entries(this.ammo)) if (v > 0) out.push({ kind: 'ammo', type: k, count: v });
    for (const [k, v] of Object.entries(this.mats)) if (v > 0) out.push({ kind: 'mat', type: k, count: v });
    this.slots = [null, null, null, null, null];
    this.ammo = { light: 0, medium: 0, heavy: 0, shells: 0, rockets: 0 };
    this.mats = { wood: 0, brick: 0, metal: 0 };
    return out;
  }
}
