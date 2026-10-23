// The browser client for one match: owns the three.js scene, turns input into
// sim commands through a host, and turns sim events into visuals, sound and HUD.
// It never changes gameplay state itself; the sim (shared/sim) does that.
import * as THREE from 'three';
import { RARITIES, PICKAXE, INTERACT, WEAPONS } from '/shared/config.js';
import { GAME } from '/shared/names.js';
import { itemName } from '/shared/sim/loot.js';
import { interactTarget, emptyCommand } from '/shared/sim/controller.js';
import { pieceAABB } from '/shared/sim/building.js';
import { WorldView } from '../render/world.js';
import { BuildView } from '../render/builds.js';
import { LootView } from '../render/loot.js';
import { StormView } from '../render/storm.js';
import { FighterView } from '../render/character.js';
import { FX } from '../render/fx.js';
import { HUD } from '../ui/hud.js';
import { iconSVG } from '../ui/icons.js';
import { sfx } from '../audio/audio.js';
import { label } from './binds.js';
import { LocalHost } from './host.js';
import { InputController } from './input.js';
import { CameraRig } from './camera.js';
import { ContrailSystem } from '../render/cosmetics.js';
import { item as cosmetic } from '/shared/cosmetics/catalog.js';
import { showWheel } from '../ui/wheel.js';

function makeSky() {
  const geo = new THREE.SphereGeometry(1500, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#2a8cf0') },
      mid: { value: new THREE.Color('#8fd3ff') },
      bottom: { value: new THREE.Color('#d9f2ff') },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
      void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bottom, min(1.0, -h * 4.0));
      gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}

function busMesh() {
  const g = new THREE.Group();
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.2, 11), lam('#2e86de'));
  body.position.y = 1.8;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.3, 11.1), lam('#ecf0f1'));
  roof.position.y = 3.5;
  const win = new THREE.Mesh(new THREE.BoxGeometry(3.52, 0.9, 9), lam('#bde4ff'));
  win.position.y = 2.5;
  const grill = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1, 0.1), lam('#f1c40f'));
  grill.position.set(0, 1.0, -5.55);
  g.add(body, roof, win, grill);
  for (const [x, z] of [[-1.6, -3.5], [1.6, -3.5], [-1.6, 3.5], [1.6, 3.5]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 12).rotateZ(Math.PI / 2), lam('#222'));
    w.position.set(x, 0.5, z);
    g.add(w);
  }
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(5.5, 18, 14), lam('#5dade2'));
  balloon.scale.set(1, 1.15, 1.5);
  balloon.position.y = 12;
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.35, 8, 30), lam('#ecf0f1'));
  stripe.rotation.y = Math.PI / 2;
  stripe.position.y = 12;
  stripe.scale.set(1.5, 1.15, 1);
  g.add(balloon, stripe);
  for (const [x, z] of [[-1.5, -4], [1.5, -4], [-1.5, 4], [1.5, 4]]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 6.5), lam('#555'));
    rope.position.set(x * 1.4, 6.6, z * 1.3);
    rope.rotation.z = x > 0 ? -0.25 : 0.25;
    g.add(rope);
  }
  return g;
}


export class Game {
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;
    this.running = false;
    this.paused = false;
    this.rebinding = false;
    this.time = 0;
    this.focusHarvest = null;
    this.spectate = null;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = opts.shadows !== false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#bfe6ff', 180, 700);
    scene.add(makeSky());
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    scene.add(new THREE.HemisphereLight('#d6efff', '#5f8f3e', 1.25));
    const sun = new THREE.DirectionalLight('#fff1d6', 2.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.sun = sun;

    // The match runs in this tab; the client only sees `match` as read-only state.
    this.host = opts.host || new LocalHost({ botCount: opts.botCount, name: opts.name, loadout: opts.loadout });
    this.match = this.host.match;
    this.player = this.host.local;

    this.fx = new FX(scene, this.camera, document.getElementById('numbers'));
    this.fx.groundFn = (x, z, y) => this.match.collision.groundHeight(x, z, y, 0.05);
    this.hud = new HUD();
    this.worldView = new WorldView(scene, this.match.world, {
      detail: opts.detail,
      fxHooks: { shatter: (el, mode) => this.onStaticShatter(el, mode) },
    });
    this.buildView = new BuildView(scene, { destroyed: (p, mode, mat) => this.onBuildDestroyed(p, mode, mat) });
    this.lootView = new LootView(scene);
    this.stormView = new StormView(scene);
    this.rocketMeshes = new Map();
    this.busMesh = null;

    this.views = new Map();
    for (const f of this.match.fighters) {
      const v = new FighterView(scene, f, { groundAt: (x, z, y) => this.match.collision.groundHeight(x, z, y + 0.5, 0.05) });
      v.local = f === this.player;
      this.views.set(f.id, v);
    }

    this.input = new InputController(renderer.domElement, {
      running: () => this.running,
      rebinding: () => this.rebinding,
      localFighter: () => this.player,
      onLockChange: (locked) => this.onLockChange(locked),
      emoteSlots: () => (opts.loadout?.emotes || []).map((id) => (id && cosmetic(id) ? cosmetic(id).clip : 0)),
      onWheel: (w) => showWheel(w, opts.loadout?.emotes || []),
    });
    this.cameraRig = new CameraRig(this.camera);
    this.contrails = new ContrailSystem(scene);
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    this.dispatch(this.match.takeEvents()); // initial loot and chests
  }

  // Read-only views of match state the HUD uses.
  get phase() { return this.match.phase; }
  get storm() { return this.match.storm; }
  get bus() { return this.match.bus; }
  get resurgence() { return this.match.resurgence; }
  aliveCount() { return this.match.aliveCount(); }

  // ------------------------------------------------------------ lifecycle

  start() {
    this.running = true;
    this.host.start();
    this.dispatch(this.match.takeEvents());
    const d = this.match.bus.dir;
    this.input.yaw = Math.atan2(-d.x, -d.z) + Math.PI * 0.35;
    this.input.pitch = -0.35;
    this.hud.show(true);
    this.input.lock();
    this.clock.start();
    requestAnimationFrame(this.loop);
  }

  onLockChange(locked) {
    if (!this.running || this.match.phase === 'over') return;
    this.paused = !locked;
    document.getElementById('pause').classList.toggle('hidden', locked);
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.paused) this.frame(dt);
    else if (this.host.online) this.pausedOnline(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // The server keeps simulating while the pause menu is open, so keep sending
  // neutral commands instead of letting it repeat the last held keys.
  pausedOnline(dt) {
    const { events } = this.host.step(dt, () => ({
      ...emptyCommand(), yaw: this.input.yaw, pitch: this.input.pitch,
    }));
    this.dispatch(events);
  }

  // ------------------------------------------------------------ frame

  frame(dt) {
    const p = this.player;
    const m = this.match;
    this.time += dt;
    this.input.updateLook(p);
    document.getElementById('bigmap').classList.toggle('hidden', !this.input.mapOpen);
    const { events, alpha } = this.host.step(dt, () => this.input.sample());
    this.dispatch(events);

    if (this.spectate && !this.spectate.alive) this.spectate = m.fighters.find((f) => f.alive && !f.human) || null;

    const lp = {
      x: p.prev.x + (p.pos.x - p.prev.x) * alpha + p.smooth.x,
      y: p.prev.y + (p.pos.y - p.prev.y) * alpha + p.smooth.y,
      z: p.prev.z + (p.pos.z - p.prev.z) * alpha + p.smooth.z,
    };
    for (const v of this.views.values()) v.update(dt, this.time, alpha, this.camera.position);
    this.cameraRig.update(p, lp, this.input.yaw, this.input.pitch, { match: m, spectate: this.spectate });

    this.updateBusMesh();
    this.updateRockets();
    this.updatePlayerOverlays();
    for (const f of m.fighters) {
      if (f.alive && !f.hidden && f.airborne && f.loadout && f.loadout.contrail) {
        const c = cosmetic(f.loadout.contrail);
        if (c) this.contrails.emit(f.id, f.pos, c.spec, dt);
      }
    }
    this.contrails.update(dt);
    this.stormView.sync(m.storm);
    this.buildView.update(dt);
    this.lootView.update(dt, this.time, p.alive ? p.pos : this.camera.position);
    this.worldView.update(dt, this.time, this.focusHarvest);
    this.fx.update(dt);
    this.hud.update(dt, this);

    // Keep the shadow camera centred on the action.
    const focus = p.alive ? lp : this.camera.position;
    this.sun.position.set(focus.x + 80, focus.y + 140, focus.z + 50);
    this.sun.target.position.set(focus.x, focus.y, focus.z);
    this.worldView.sunSprite.position.copy(this.camera.position).add(new THREE.Vector3(80, 140, 50).normalize().multiplyScalar(1100));
  }

  updateBusMesh() {
    const m = this.match;
    if (m.phase === 'bus' && m.bus) {
      if (!this.busMesh) {
        this.busMesh = busMesh();
        this.busMesh.rotation.y = Math.atan2(-m.bus.dir.x, -m.bus.dir.z);
        this.scene.add(this.busMesh);
      }
      const b = m.bus.pos;
      this.busMesh.position.set(b.x, b.y - 2 + Math.sin(this.time * 2) * 0.3, b.z);
    } else if (this.busMesh) {
      this.scene.remove(this.busMesh);
      this.busMesh = null;
    }
  }

  updateRockets() {
    const live = new Set();
    for (const r of this.match.combat.rockets) {
      live.add(r.id);
      let mesh = this.rocketMeshes.get(r.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.09, 0.6, 6).rotateX(Math.PI / 2),
          new THREE.MeshLambertMaterial({ color: '#556b2f', emissive: '#331100' }),
        );
        mesh.lookAt(r.dir.x, r.dir.y, r.dir.z);
        this.scene.add(mesh);
        this.rocketMeshes.set(r.id, mesh);
      }
      mesh.position.set(r.pos.x, r.pos.y, r.pos.z);
    }
    for (const [id, mesh] of this.rocketMeshes) {
      if (!live.has(id)) { this.scene.remove(mesh); this.rocketMeshes.delete(id); }
    }
  }

  // Build preview, edit tiles, interaction prompt, progress bar, weak point.
  updatePlayerOverlays() {
    const p = this.player;
    const m = this.match;
    const hud = this.hud;
    let preview = null, valid = false;
    if (p.alive && !p.airborne && p.buildMode && !p.editMode) {
      preview = m.builds.computeTarget(p.buildPiece, p.pos, p.yaw, p.pitch);
      valid = p.mats[p.buildMat] >= 10 && m.builds.canPlace(preview);
      valid = valid || m.builds.pieces.has(preview.key);
    }
    this.buildView.setPreview(preview, valid);
    this.buildView.setEdit(p.alive && p.editMode ? p.editing : null);

    this.focusHarvest = null;
    if (p.alive && !p.airborne && p.selected === 0 && !p.buildMode) {
      const { origin, dir } = p.aimRay();
      const look = m.collision.raycast(origin, dir, PICKAXE.range + 1.5);
      if (look && look.collider && look.collider.kind === 'harvest') {
        this.focusHarvest = m.world.harvestables.find((h) => h.collider === look.collider) || null;
      }
    }

    if (!p.alive) {
      const redeploy = p.respawnT !== undefined && !p.eliminated;
      hud.setPrompt(redeploy ? `Redeploying in ${Math.ceil(Math.max(0, p.respawnT))}...` : '');
      hud.setProgress(null);
      return;
    }
    if (p.airborne || p.state === 'bus') { hud.setPrompt(''); hud.setProgress(null); return; }
    const t = interactTarget(m, p);
    if (t && t.kind === 'chest') {
      hud.setPrompt(`<b>${label('interact')}</b>Hold to search ${t.chest.type === 'chest' ? 'Chest' : 'Ammo Box'}`);
    } else if (t && t.kind === 'pickup') {
      const rc = RARITIES[t.rarity].color;
      const verb = t.full ? (p.selected > 0 ? 'Swap for' : 'Inventory full:') : 'Pick up';
      hud.setPrompt(`<b>${label('interact')}</b>${verb} <span class="prompt-icon" style="background:${rc}">${iconSVG(t.pickup.item.type)}</span><span style="color:${rc}">${itemName(t.pickup.item)}</span>`);
    } else hud.setPrompt('');

    if (p.heal) hud.setProgress(1 - p.heal.t / p.heal.total, `Using ${p.heal.type}`);
    else if (p.reloadT > 0 && p.weapon) hud.setProgress(1 - p.reloadT / this.reloadTime(p), 'Reloading');
    else if (p.chestT > 0) hud.setProgress(p.chestT / INTERACT.chestHold, 'Searching');
    else hud.setProgress(null);
  }

  reloadTime(p) {
    const w = p.weapon;
    return WEAPONS[w.type].reload[w.rarity];
  }

  // ------------------------------------------------------------ events

  // Volume for a sound from fighter `by` at `pos`, as heard by the local player.
  volumeFor(ev) {
    if (ev.by === undefined || ev.by === null || ev.by === this.player.id) return ev.vol ?? 1;
    const pos = ev.pos;
    if (!pos) return ev.vol ?? 1;
    const d = Math.hypot(pos.x - this.player.pos.x, pos.y - this.player.pos.y, pos.z - this.player.pos.z);
    return Math.max(0, 1 - d / 160) * 0.8;
  }

  distanceVolume(pos, scale, floor = 0.05) {
    const p = this.player.pos;
    return Math.max(floor, 1 - Math.hypot(pos.x - p.x, pos.y - p.y, pos.z - p.z) / scale);
  }

  onStaticShatter(el, mode) {
    if (mode === 'init') return; // already broken before we joined
    const n = this.match.world.brokenThisTick;
    if (n < 40) this.fx.shatter(el.min, el.max, el.hex || '#bbbbbb', { fall: mode === 'fall' });
    if (n < 3) {
      const c = { x: (el.min.x + el.max.x) / 2, y: (el.min.y + el.max.y) / 2, z: (el.min.z + el.max.z) / 2 };
      sfx('buildBreak', this.distanceVolume(c, 120) * (mode === 'fall' ? 0.7 : 1));
    }
  }

  onBuildDestroyed(p, mode, mat) {
    if (mode === 'quiet') return; // swapped for the server's copy
    if (mode === 'fizz') {
      const bb = pieceAABB(p);
      this.fx.burst({ x: (bb.min[0] + bb.max[0]) / 2, y: (bb.min[1] + bb.max[1]) / 2, z: (bb.min[2] + bb.max[2]) / 2 }, '#9ad0ec', 8, 3, 0.8);
      return;
    }
    const bb = pieceAABB(p);
    const min = { x: bb.min[0], y: bb.min[1], z: bb.min[2] }, max = { x: bb.max[0], y: bb.max[1], z: bb.max[2] };
    this.fx.shatter(min, max, mat, { fall: mode === 'fall' });
    const c = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
    sfx('buildBreak', this.distanceVolume(c, 120) * (mode === 'fall' ? 0.6 : 1));
  }

  dispatch(events) {
    const me = this.player.id;
    const hud = this.hud;
    for (const ev of events) {
      switch (ev.type) {
        case 'staticDamaged': case 'staticBroken': case 'harvestHit': case 'harvestBroken':
          this.worldView.handle(ev); break;
        case 'buildPlaced': case 'buildChanged': case 'buildDamaged': case 'buildComplete':
        case 'buildCollapsing': case 'buildDestroyed':
          this.buildView.handle(ev); break;
        case 'pickupSpawned': case 'pickupRemoved': case 'chestPlaced': case 'chestOpened': case 'chestMoved':
          this.lootView.handle(ev); break;
        case 'sfx':
          if (ev.own && ev.by !== me) break;
          sfx(ev.name, this.volumeFor(ev));
          break;
        case 'muzzle': this.fx.muzzle(ev.pos); break;
        case 'tracer': this.fx.tracer(ev.from, ev.to); break;
        case 'burst': this.fx.burst(ev.pos, ev.color, ev.n, ev.speed, ev.size ?? 1); break;
        case 'explosion':
          this.fx.explosion(ev.pos, ev.radius);
          sfx('explosion', this.distanceVolume(ev.pos, 200, 0.1));
          this.cameraRig.shake(this.distanceVolume(ev.pos, 60, 0) * 1.2);
          break;
        case 'kick': if (ev.by === me) hud.kick(ev.k); break;
        case 'matGain': if (ev.by === me) hud.matGain(ev.mat, ev.n); break;
        case 'damageNumber': if (ev.by === me) this.fx.damageNumber(ev.pos, ev.amount, ev.kind); break;
        case 'hit':
          if (ev.by === me) {
            this.fx.damageNumber(ev.pos, ev.amount, ev.kind);
            hud.hitMarker(ev.head);
            sfx(ev.head ? 'headshot' : 'hit');
            if (ev.shieldBroke) sfx('shieldBreak', 0.7);
          }
          if (ev.target === me && !ev.storm) {
            hud.damageFlash(ev.from);
            this.cameraRig.shake(Math.min(0.8, ev.amount / 80) + (ev.head ? 0.3 : 0));
            sfx('hurt', 0.6);
          }
          break;
        case 'eliminated': {
          const at = ev.pos;
          this.fx.dissolve(at, [ev.color, '#7fd0ff', '#ffffff']);
          break;
        }
        case 'feed': hud.feed(ev.text, ev.target === me || ev.killer === me); break;
        case 'message': this.onMessage(ev); break;
        case 'spectate':
          if (ev.id === me) this.spectate = ev.killer ? this.match.fighters.find((f) => f.id === ev.killer) : null;
          break;
        case 'jumped':
          if (ev.id === me) hud.message('', `Look down + ${label('forward')} to dive. ${label('jump')} opens the glider.`, 3);
          break;
        case 'landed': if (ev.id === me) hud.message('', '', 0.01); break;
        case 'respawned': if (ev.id === me) { this.spectate = null; } break;
        case 'placement': if (ev.id === me) this.showEnd(ev); break;
        default:
      }
    }
  }

  onMessage(ev) {
    if (ev.to !== null && ev.to !== this.player.id) return;
    let { text, sub } = ev;
    if (ev.key === 'busStart') sub = `Press ${label('jump')} to jump`;
    if (ev.key === 'stormForming') sub = `Check your map (${label('map')})`;
    this.hud.message(text, sub, ev.dur);
    if (ev.sfx === 'elim') sfx('elim');
    if (ev.sfx === 'storm') sfx('storm', 0.6);
  }

  showEnd(ev) {
    const end = document.getElementById('end');
    const title = end.querySelector('.end-title');
    const sub = end.querySelector('.end-sub');
    if (ev.won) {
      title.textContent = GAME.victory;
      title.className = 'end-title';
      sfx('victory');
    } else {
      title.textContent = `#${ev.placement}`;
      title.className = 'end-title lose';
    }
    sub.textContent = `${ev.kills} elimination${ev.kills === 1 ? '' : 's'}`;
    document.getElementById('end-rewards').innerHTML = '';
    if (this.opts.onEnd) {
      const p = this.player;
      this.opts.onEnd({
        placement: ev.placement, total: this.match.fighters.length, kills: ev.kills,
        assists: (p.stats && p.stats.assists) || 0, survivalS: Math.round(p.diedAt || this.match.time),
      }, !!this.opts.host);
    }
    setTimeout(() => {
      end.classList.remove('hidden');
      document.exitPointerLock?.();
    }, ev.won ? 600 : 2500);
  }
}
