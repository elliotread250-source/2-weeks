// Player input, third-person camera, combat/build/edit modes and interaction.
import * as THREE from 'three';
import { PLAYER, WEAPONS, KEYS, BUILD_COST, MAT_ORDER, PICKAXE } from './config.js';
import { sfx } from './audio.js';
import { itemName, itemRarity } from './loot.js';
import { RARITIES } from './config.js';

const PIECE_KEYS = { KeyZ: 'wall', F1: 'wall', KeyX: 'floor', F2: 'floor', KeyC: 'ramp', F3: 'ramp', KeyV: 'cone', F4: 'cone' };

export class PlayerController {
  constructor(game, camera, canvas) {
    this.game = game;
    this.camera = camera;
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed this frame
    this.lmb = false; this.rmb = false;
    this.lmbPressed = false; this.rmbPressed = false;
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

  bind() {
    const c = this.canvas;
    window.addEventListener('keydown', (e) => {
      if (!this.game.running) return;
      if (['Space', 'Tab', 'F1', 'F2', 'F3', 'F4', 'KeyQ'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    c.addEventListener('mousedown', (e) => {
      if (!this.game.running) return;
      if (!this.locked) { this.lock(); return; }
      if (e.button === 0) { this.lmb = true; this.lmbPressed = true; }
      if (e.button === 2) { this.rmb = true; this.rmbPressed = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) this.rmb = false;
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
      if (!this.locked) { this.lmb = false; this.rmb = false; this.keys.clear(); }
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
    let sens = 0.0022 * this.sens;
    if (this.scoped) sens *= 0.25;
    else if (this.ads) sens *= 0.6;
    this.camYaw -= this.mdx * sens;
    this.camPitch -= this.mdy * sens;
    this.camPitch = Math.max(-1.45, Math.min(1.35, this.camPitch));
    this.mdx = 0; this.mdy = 0;

    const pr = (code) => this.pressed.has(code);
    if (pr(KEYS.map)) this.mapOpen = !this.mapOpen;
    document.getElementById('bigmap').classList.toggle('hidden', !this.mapOpen);

    if (g.phase === 'bus' && p.state === 'bus') {
      if (pr('Space')) g.jumpFromBus(p);
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
    if (p.state === 'skydive' && pr('Space')) {
      const above = p.pos.y - g.collision.groundHeight(p.pos.x, p.pos.z, p.pos.y);
      if (above < 110) { p.state = 'glide'; sfx('glider'); }
    }

    // ---- mode switching
    if (!airborne) {
      if (pr(KEYS.build)) {
        if (this.editMode) { builds.confirmEdit(); this.editMode = false; }
        this.buildMode = !this.buildMode;
        p.heal = null;
      }
      for (const [code, piece] of Object.entries(PIECE_KEYS)) {
        if (pr(code)) {
          if (this.editMode) { builds.confirmEdit(); this.editMode = false; }
          this.buildMode = true; this.buildPiece = piece; p.heal = null;
        }
      }
      if (pr(KEYS.matCycle) && this.buildMode) {
        this.buildMat = MAT_ORDER[(MAT_ORDER.indexOf(this.buildMat) + 1) % 3];
      }
      for (let i = 1; i <= 6; i++) {
        if (pr(`Digit${i}`)) {
          if (this.editMode) { builds.confirmEdit(); this.editMode = false; }
          this.buildMode = false;
          p.select(i - 1);
        }
      }
      if (pr(KEYS.edit)) {
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
            this.lastTile = -1;
          }
        }
      }
    } else {
      this.buildMode = false;
    }
    if (pr(KEYS.reload) && !this.buildMode) g.combat.tryReload(p);

    // ---- movement
    const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    const wish = new THREE.Vector3();
    if (this.keys.has('KeyW')) wish.add(fwd);
    if (this.keys.has('KeyS')) wish.sub(fwd);
    if (this.keys.has('KeyD')) wish.add(right);
    if (this.keys.has('KeyA')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();

    const w = p.weapon;
    this.ads = this.rmb && !this.buildMode && !this.editMode && !!w && !airborne;
    this.scoped = this.ads && w && WEAPONS[w.type].scope;

    if (airborne) {
      const sp = p.state === 'skydive' ? PLAYER.skydiveSpeed : PLAYER.glideSpeed;
      p.vel.x += (wish.x * sp - p.vel.x) * Math.min(1, dt * 2);
      p.vel.z += (wish.z * sp - p.vel.z) * Math.min(1, dt * 2);
      p.dive = this.camPitch < -0.6 && this.keys.has('KeyW');
      p.yaw = this.camYaw;
    } else {
      let speed = PLAYER.runSpeed;
      const sprinting = this.keys.has('ShiftLeft') && this.keys.has('KeyW') && !this.ads && !this.lmb;
      if (sprinting) speed = PLAYER.sprintSpeed;
      if (this.ads) speed = PLAYER.adsSpeed;
      if (p.heal) speed = PLAYER.healSpeed;
      if (p.swimming) speed = PLAYER.swimSpeed;
      const acc = p.onGround ? 14 : 3;
      p.vel.x += (wish.x * speed - p.vel.x) * Math.min(1, acc * dt);
      p.vel.z += (wish.z * speed - p.vel.z) * Math.min(1, acc * dt);
      if (this.keys.has('Space') && (p.onGround || p.swimming)) {
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
    this.lmbPressed = false;
    this.rmbPressed = false;
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
      if (this.lmb) g.combat.swing(p, origin, dir);
      return;
    }
    if (!it) return;
    if (it.kind === 'weapon') {
      const spec = WEAPONS[it.type];
      if ((spec.auto && this.lmb) || this.lmbPressed) {
        g.combat.fire(p, origin, dir, { ads: this.ads, firstShotAccurate: true });
      }
    } else if (it.kind === 'consumable' && this.lmbPressed) {
      if (!g.combat.startHeal(p)) g.hud.message('', "You can't use that right now", 1.2);
    }
  }

  updateBuild() {
    const g = this.game;
    const p = g.player;
    const builds = g.builds;
    if (this.rmbPressed) this.buildMat = MAT_ORDER[(MAT_ORDER.indexOf(this.buildMat) + 1) % 3];
    // Auto-switch material when the current one runs dry.
    if (p.mats[this.buildMat] < BUILD_COST) {
      const alt = MAT_ORDER.find((m) => p.mats[m] >= BUILD_COST);
      if (alt) this.buildMat = alt;
    }
    const target = builds.computeTarget(this.buildPiece, p.pos, this.camYaw, this.camPitch);
    const afford = p.mats[this.buildMat] >= BUILD_COST;
    const valid = afford && builds.canPlace(target);
    builds.setPreview(target, valid || builds.pieces.has(target.key));
    if (this.lmb && valid && this.buildCd <= 0) {
      if (builds.place(target, this.buildMat, p)) {
        p.mats[this.buildMat] -= BUILD_COST;
        sfx('build');
        this.buildCd = 0.06;
      }
    } else if (this.lmbPressed && !afford) {
      g.hud.message('', `Not enough ${this.buildMat}`, 1.2);
    }
  }

  updateEdit() {
    const g = this.game;
    const builds = g.builds;
    const e = builds.editing;
    if (!e || e.piece.dead) { this.editMode = false; builds.confirmEdit(); return; }
    builds.setPreview(null);
    if (this.rmbPressed) {
      builds.confirmEdit(true);
      this.editMode = false;
      sfx('build', 0.6);
      return;
    }
    const tile = builds.tileAt(e.piece, this.camPos, this.camDir);
    if (this.lmbPressed) {
      builds.toggleTile(tile, false);
      this.lastTile = tile;
      this.dragAdd = e.selected.includes(tile);
    } else if (this.lmb && tile !== this.lastTile && tile >= 0) {
      if (this.dragAdd) builds.toggleTile(tile, true);
      this.lastTile = tile;
    }
  }

  updateInteract(dt) {
    const g = this.game;
    const p = g.player;
    const chest = g.loot.nearestChest(p.pos, 2.4);
    const pickup = g.loot.nearestPickup(p.pos, 2.2, (pk) => pk.item.kind === 'weapon' || pk.item.kind === 'consumable');
    if (chest && (!pickup || chest.pos.distanceTo(p.pos) < pickup.pos.distanceTo(p.pos))) {
      g.hud.setPrompt(`<b>E</b>Hold to search ${chest.type === 'chest' ? 'Chest' : 'Ammo Box'}`);
      if (this.keys.has(KEYS.interact)) {
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
      g.hud.setPrompt(`<b>E</b>${verb} <span style="color:${rc}">${itemName(pickup.item)}</span>`);
      if (this.pressed.has(KEYS.interact)) {
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
