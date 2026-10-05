// Player input, third-person camera, combat/build/edit modes and interaction.
import * as THREE from 'three';
import { PLAYER, WEAPONS, BUILD_COST, MAT_ORDER, PICKAXE } from './config.js';
import { binds, settings, label } from './binds.js';
import { sfx } from './audio.js';
import { itemName, itemRarity } from './loot.js';
import { iconSVG } from './icons.js';
import { RARITIES } from './config.js';

const PIECES = ['wall', 'floor', 'ramp', 'cone'];
const SLOTS = ['pickaxe', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5'];

export class PlayerController {
  constructor(game, camera, canvas) {
    this.game = game;
    this.camera = camera;
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // inputs pressed this frame
    this.released = new Set(); // inputs released this frame
    this.mdx = 0; this.mdy = 0;
    this.camYaw = 0;
    this.camPitch = -0.1;
    this.sens = 1;
    this.ads = false;
    this.scoped = false;
    this.buildMode = false;
    this.editMode = false;
    this.buildPiece = 'wall';
    this.buildMat = 'wood';
    this.buildCd = 0;
    this.chestT = 0;
    this.mapOpen = false;
    this.locked = false;
    this.camPos = new THREE.Vector3();
    this.camDir = new THREE.Vector3();
    this.lastTile = -1;
    this.bind();
  }

  // Inputs are tracked by code (keyboard event.code or MouseN) and read back
  // through the player's binds, so every action can be rebound.
  held(action) { return this.keys.has(binds[action]); }
  pr(action) { return this.pressed.has(binds[action]); }
  rel(action) { return this.released.has(binds[action]); }

  down(code) {
    if (!this.keys.has(code)) this.pressed.add(code);
    this.keys.add(code);
  }

  up(code) {
    if (this.keys.delete(code)) this.released.add(code);
  }

  bind() {
    const c = this.canvas;
    const bound = () => new Set(Object.values(binds));
    window.addEventListener('keydown', (e) => {
      if (!this.game.running || this.game.rebinding) return;
      if (e.code === 'Space' || e.code === 'Tab' || bound().has(e.code)) e.preventDefault();
      this.down(e.code);
    });
    window.addEventListener('keyup', (e) => this.up(e.code));
    c.addEventListener('mousedown', (e) => {
      if (!this.game.running) return;
      if (!this.locked) { this.lock(); return; }
      e.preventDefault();
      this.down(`Mouse${e.button}`);
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button >= 3) e.preventDefault(); // keep side buttons from navigating back
      this.up(`Mouse${e.button}`);
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mdx += e.movementX;
      this.mdy += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      const p = this.game.player;
      if (this.buildMode) {
        const i = MAT_ORDER.indexOf(this.buildMat);
        this.buildMat = MAT_ORDER[(i + (e.deltaY > 0 ? 1 : 2)) % 3];
        return;
      }
      p.select((p.selected + (e.deltaY > 0 ? 1 : 5)) % 6);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
      if (!this.locked) this.keys.clear();
      this.game.onLockChange(this.locked);
    });
  }

  lock() {
    const p = this.canvas.requestPointerLock?.();
    if (p && p.catch) p.catch(() => {});
  }

  resetModes() {
    this.buildMode = false;
    this.editMode = false;
    this.ads = false;
    this.game.builds.setPreview(null);
    if (this.game.builds.editing) this.game.builds.confirmEdit();
  }

  // Camera ray origin pushed forward to the player's depth so shots never hit
  // things between the camera and the character.
  aimRay() {
    const p = this.game.player;
    const pivot = p.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
    const t0 = Math.max(0, pivot.clone().sub(this.camPos).dot(this.camDir));
    return { origin: this.camPos.clone().addScaledVector(this.camDir, t0), dir: this.camDir.clone() };
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const builds = g.builds;

    // Look.
    let sens = 0.0022 * (settings.sensitivity || 1);
    if (this.scoped) sens *= 0.25;
    else if (this.ads) sens *= 0.6;
    this.camYaw -= this.mdx * sens;
    this.camPitch -= this.mdy * sens;
    this.camPitch = Math.max(-1.45, Math.min(1.35, this.camPitch));
    this.mdx = 0; this.mdy = 0;

    const pr = (action) => this.pr(action);
    if (pr('map')) this.mapOpen = !this.mapOpen;
    document.getElementById('bigmap').classList.toggle('hidden', !this.mapOpen);

    if (g.phase === 'bus' && p.state === 'bus') {
      if (pr('jump')) g.jumpFromBus(p);
      this.updateCamera(dt);
      this.endFrame();
      return;
    }
    if (!p.alive) {
      this.resetModes();
      g.hud.setPrompt('');
      g.hud.setProgress(null);
      this.updateCamera(dt);
      this.endFrame();
      return;
    }

    const airborne = p.state === 'skydive' || p.state === 'glide';
    if (p.state === 'skydive' && pr('jump')) {
      const above = p.pos.y - g.collision.groundHeight(p.pos.x, p.pos.z, p.pos.y);
      if (above < 110) { p.state = 'glide'; sfx('glider'); }
    }

    // ---- mode switching
    if (!airborne) {
      if (pr('build')) {
        if (this.editMode) { builds.confirmEdit(); this.editMode = false; }
        this.buildMode = !this.buildMode;
        p.heal = null;
      }
      for (const piece of PIECES) {
        if (pr(piece)) {
          if (this.editMode) { builds.confirmEdit(); this.editMode = false; }
          this.buildMode = true; this.buildPiece = piece; p.heal = null;
        }
      }
      if (pr('matCycle') && this.buildMode) {
        this.buildMat = MAT_ORDER[(MAT_ORDER.indexOf(this.buildMat) + 1) % 3];
      }
      SLOTS.forEach((action, i) => {
        if (pr(action)) {
          if (this.editMode) { builds.confirmEdit(); this.editMode = false; }
          this.buildMode = false;
          p.select(i);
        }
      });
      if (pr('edit')) {
        if (this.editMode) {
          builds.confirmEdit();
          this.editMode = false;
          sfx('build', 0.6);
        } else {
          const hit = g.collision.raycast(this.camPos, this.camDir, 12, (c) => c.kind === 'build');
          const piece = hit && hit.collider && hit.collider.kind === 'build' ? hit.collider.owner : null;
          if (piece && piece.owner === p && hit.point && Math.hypot(hit.point.x - p.pos.x, hit.point.y - p.pos.y - 1, hit.point.z - p.pos.z) < 7) {
            builds.startEdit(piece);
            this.editMode = true;
            this.editClicked = false;
            this.lastTile = -1;
          }
        }
      }
    } else {
      this.buildMode = false;
    }
    if (pr('reload') && !this.buildMode) g.combat.tryReload(p);

    // ---- movement
    const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    const wish = new THREE.Vector3();
    if (this.held('forward')) wish.add(fwd);
    if (this.held('back')) wish.sub(fwd);
    if (this.held('right')) wish.add(right);
    if (this.held('left')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();

    const w = p.weapon;
    this.ads = this.held('aim') && !this.buildMode && !this.editMode && !!w && !airborne;
    this.scoped = this.ads && w && WEAPONS[w.type].scope;

    if (airborne) {
      const sp = p.state === 'skydive' ? PLAYER.skydiveSpeed : PLAYER.glideSpeed;
      p.vel.x += (wish.x * sp - p.vel.x) * Math.min(1, dt * 2);
      p.vel.z += (wish.z * sp - p.vel.z) * Math.min(1, dt * 2);
      p.dive = this.camPitch < -0.6 && this.held('forward');
      p.yaw = this.camYaw;
    } else {
      let speed = PLAYER.runSpeed;
      const sprinting = this.held('sprint') && this.held('forward') && !this.ads && !this.held('fire');
      if (sprinting) speed = PLAYER.sprintSpeed;
      if (this.ads) speed = PLAYER.adsSpeed;
      if (p.heal) speed = PLAYER.healSpeed;
      if (p.swimming) speed = PLAYER.swimSpeed;
      const acc = p.onGround ? 14 : 3;
      p.vel.x += (wish.x * speed - p.vel.x) * Math.min(1, acc * dt);
      p.vel.z += (wish.z * speed - p.vel.z) * Math.min(1, acc * dt);
      if (this.held('jump') && (p.onGround || p.swimming)) {
        p.vel.y = p.swimming ? PLAYER.jumpVel * 0.7 : PLAYER.jumpVel;
        p.onGround = false;
      }
      p.yaw = this.camYaw;
      p.pitch = this.camPitch;
    }

    this.updateCamera(dt);

    // ---- actions
    this.buildCd -= dt;
    g.focusHarvest = null;
    if (this.editMode) this.updateEdit();
    else if (this.buildMode) this.updateBuild(dt);
    else {
      builds.setPreview(null);
      if (!airborne) this.updateCombat();
    }
    if (!airborne) this.updateInteract(dt);
    else { g.hud.setPrompt(''); g.hud.setProgress(null); }

    // Progress bar for heals and reloads.
    if (p.heal) g.hud.setProgress(1 - p.heal.t / p.heal.total, `Using ${p.heal.type}`);
    else if (p.reloadT > 0 && w) g.hud.setProgress(1 - p.reloadT / WEAPONS[w.type].reload[w.rarity], 'Reloading');
    else if (this.chestT <= 0) g.hud.setProgress(null);

    this.endFrame();
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }

  updateCombat() {
    const g = this.game;
    const p = g.player;
    const { origin, dir } = this.aimRay();
    const it = p.item;
    if (p.selected === 0) {
      // Show the harvesting weak point on whatever we're looking at.
      const look = g.collision.raycast(origin, dir, PICKAXE.range + 1.5);
      if (look && look.collider && look.collider.kind === 'harvest') {
        g.focusHarvest = g.world.harvestables.find((h) => h.collider === look.collider) || null;
      }
      if (this.held('fire')) g.combat.swing(p, origin, dir);
      return;
    }
    if (!it) return;
    if (it.kind === 'weapon') {
      const spec = WEAPONS[it.type];
      if ((spec.auto && this.held('fire')) || this.pr('fire')) {
        g.combat.fire(p, origin, dir, { ads: this.ads, firstShotAccurate: true });
      }
    } else if (it.kind === 'consumable' && this.pr('fire')) {
      if (!g.combat.startHeal(p)) g.hud.message('', "You can't use that right now", 1.2);
    }
  }

  updateBuild() {
    const g = this.game;
    const p = g.player;
    const builds = g.builds;
    if (this.pr('aim')) this.buildMat = MAT_ORDER[(MAT_ORDER.indexOf(this.buildMat) + 1) % 3];
    // Auto-switch material when the current one runs dry.
    if (p.mats[this.buildMat] < BUILD_COST) {
      const alt = MAT_ORDER.find((m) => p.mats[m] >= BUILD_COST);
      if (alt) this.buildMat = alt;
    }
    const target = builds.computeTarget(this.buildPiece, p.pos, this.camYaw, this.camPitch);
    const afford = p.mats[this.buildMat] >= BUILD_COST;
    const valid = afford && builds.canPlace(target);
    builds.setPreview(target, valid || builds.pieces.has(target.key));
    if (this.held('fire') && valid && this.buildCd <= 0) {
      if (builds.place(target, this.buildMat, p)) {
        p.mats[this.buildMat] -= BUILD_COST;
        sfx('build');
        this.buildCd = 0.06;
      }
    } else if (this.pr('fire') && !afford) {
      g.hud.message('', `Not enough ${this.buildMat}`, 1.2);
    }
  }

  updateEdit() {
    const g = this.game;
    const builds = g.builds;
    const e = builds.editing;
    if (!e || e.piece.dead) { this.editMode = false; builds.confirmEdit(); return; }
    builds.setPreview(null);
    if (this.pr('editReset')) {
      builds.confirmEdit(true);
      this.editMode = false;
      sfx('build', 0.6);
      return;
    }
    const tile = builds.tileAt(e.piece, this.camPos, this.camDir);
    if (this.pr('fire')) {
      builds.toggleTile(tile, false);
      this.lastTile = tile;
      this.dragAdd = e.selected.includes(tile);
      this.editClicked = true;
    } else if (this.held('fire') && tile !== this.lastTile && tile >= 0) {
      if (this.dragAdd) builds.toggleTile(tile, true);
      this.lastTile = tile;
    }
    // Fortnite's "confirm edit on release": letting go of fire applies it.
    if (settings.confirmEditOnRelease && this.editClicked && this.rel('fire')) {
      builds.confirmEdit();
      this.editMode = false;
      this.editClicked = false;
      sfx('build', 0.6);
    }
  }

  updateInteract(dt) {
    const g = this.game;
    const p = g.player;
    const chest = g.loot.nearestChest(p.pos, 2.4);
    const pickup = g.loot.nearestPickup(p.pos, 2.2, (pk) => pk.item.kind === 'weapon' || pk.item.kind === 'consumable');
    if (chest && (!pickup || chest.pos.distanceTo(p.pos) < pickup.pos.distanceTo(p.pos))) {
      g.hud.setPrompt(`<b>${label('interact')}</b>Hold to search ${chest.type === 'chest' ? 'Chest' : 'Ammo Box'}`);
      if (this.held('interact')) {
        this.chestT += dt;
        g.hud.setProgress(this.chestT / 0.5, 'Searching');
        if (this.chestT >= 0.5) {
          g.loot.openChest(chest);
          sfx('chest');
          this.chestT = 0;
        }
      } else this.chestT = 0;
      return;
    }
    this.chestT = 0;
    if (pickup) {
      const rc = RARITIES[itemRarity(pickup.item)].color;
      const full = !p.hasRoomFor(pickup.item);
      const verb = full ? (p.selected > 0 ? 'Swap for' : 'Inventory full:') : 'Pick up';
      g.hud.setPrompt(`<b>${label('interact')}</b>${verb} <span class="prompt-icon" style="background:${rc}">${iconSVG(pickup.item.type)}</span><span style="color:${rc}">${itemName(pickup.item)}</span>`);
      if (this.pr('interact')) {
        if (!full) g.pickupItem(p, pickup);
        else if (p.selected > 0) {
          const old = p.slots[p.selected - 1];
          p.slots[p.selected - 1] = null;
          g.pickupItem(p, pickup);
          g.loot.drop(old, p.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), true);
        }
      }
      return;
    }
    g.hud.setPrompt('');
  }

  updateCamera() {
    const g = this.game;
    const p = g.player;
    const cam = this.camera;
    cam.rotation.order = 'YXZ';
    let pivot, dist, shoulder, fov = 75;

    if (g.phase === 'bus' && p.state === 'bus') {
      pivot = g.bus.pos.clone().add(new THREE.Vector3(0, 5, 0));
      dist = 34; shoulder = 0;
    } else if (!p.alive) {
      pivot = (g.spectate && g.spectate.alive ? g.spectate.pos : p.pos).clone().add(new THREE.Vector3(0, 1.6, 0));
      dist = 9; shoulder = 0;
    } else if (p.state === 'skydive' || p.state === 'glide') {
      pivot = p.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
      dist = 6.5; shoulder = 0;
      fov = p.state === 'skydive' ? 85 : 78;
    } else {
      pivot = p.pos.clone().add(new THREE.Vector3(0, 1.65, 0));
      dist = 3.4; shoulder = 0.75;
      if (this.ads) {
        const w = p.weapon;
        dist = 1.9; shoulder = 0.62;
        fov = 75 / WEAPONS[w.type].zoom;
      }
      if (this.buildMode || this.editMode) dist = 3.8;
    }

    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const dir = new THREE.Vector3(-Math.sin(this.camYaw) * cp, sp, -Math.cos(this.camYaw) * cp);
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));

    if (this.scoped) {
      // First-person scope view.
      cam.position.copy(p.pos).add(new THREE.Vector3(0, 1.75, 0)).addScaledVector(dir, 0.3);
      fov = 75 / WEAPONS.sniper.zoom;
      p.model.root.visible = false;
    } else {
      p.model.root.visible = p.alive;
      const start = pivot.clone().addScaledVector(right, shoulder * 0.5);
      const desired = pivot.clone().addScaledVector(right, shoulder).addScaledVector(dir, -dist).add(new THREE.Vector3(0, 0.25, 0));
      const toCam = desired.clone().sub(start);
      const len = toCam.length();
      toCam.normalize();
      const hit = g.collision.raycast(start, toCam, len);
      if (hit) desired.copy(start).addScaledVector(toCam, Math.max(0.3, hit.t - 0.25));
      cam.position.copy(desired);
    }
    cam.rotation.set(this.camPitch, this.camYaw, 0);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * 0.35;
      cam.updateProjectionMatrix();
    }
    this.camPos.copy(cam.position);
    this.camDir.copy(dir);
  }
}
