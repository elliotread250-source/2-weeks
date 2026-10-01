// Match orchestration: scene, battle bus, physics, storm, eliminations,
// Resurgence redeploys and the win condition.
import * as THREE from 'three';
import {
  PLAYER, BOT_COUNT, RESURGENCE_END_PHASE, RESURGENCE_DELAY, WORLD_HALF,
} from './config.js';
import { CollisionWorld } from './collision.js';
import { terrainHeight, POIS } from './terrain.js';
import { World } from './world.js';
import { BuildSystem } from './building.js';
import { LootSystem } from './loot.js';
import { Fighter, OUTFITS } from './character.js';
import { BotBrain } from './bot.js';
import { Combat } from './combat.js';
import { Storm } from './storm.js';
import { HUD } from './hud.js';
import { FX } from './fx.js';
import { PlayerController } from './player.js';
import { sfx } from './audio.js';
import { rand, pick } from './util.js';

const BOT_NAMES = [
  'Jonesy', 'Peely', 'Raven', 'Drift', 'Midas', 'Fishstick', 'Meowscles', 'Brite Bomber',
  'Skull Trooper', 'Renegade', 'Calamity', 'Ramirez', 'Spitfire', 'Lynx', 'Ragnarok', 'Tomatohead',
  'Beef Boss', 'Cuddle Team', 'Black Knight', 'Aura', 'Crystal', 'Banshee', 'Hunter', 'Jules',
  'Kit', 'Slone', 'Mancake', 'Bushranger', 'Dark Voyager', 'Galaxy',
];

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
    this.time = 0;
    this.phase = 'init';

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

    this.collision = new CollisionWorld(terrainHeight);
    this.world = new World(scene, this.collision);
    this.world.build();
    this.builds = new BuildSystem(scene, this.collision);
    this.builds.onDestroyed = (p) => {
      const c = new THREE.Vector3(p.gx * 5 + 2.5, p.baseY + 1.5, p.gz * 5 + 2.5);
      this.fx.burst(c, p.mat === 'wood' ? '#a0703f' : p.mat === 'brick' ? '#b0533a' : '#9aa5b1', 10, 5, 2);
      sfx('buildBreak', Math.max(0.05, 1 - c.distanceTo(this.player.pos) / 120));
    };
    this.loot = new LootSystem(scene, this.collision);
    this.loot.spawnFromSpots(this.world.lootSpots);
    this.fx = new FX(scene, this.camera, document.getElementById('numbers'));
    this.hud = new HUD();
    this.storm = new Storm(scene);
    this.combat = new Combat(this);

    this.fighters = [];
    this.player = new Fighter(scene, 'You', true, OUTFITS[0]);
    this.fighters.push(this.player);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < BOT_COUNT; i++) {
      const f = new Fighter(scene, names[i % names.length], false, OUTFITS[(i + 1) % OUTFITS.length]);
      new BotBrain(this, f, rand(0.15, 0.85));
      this.fighters.push(f);
    }
    this.controller = new PlayerController(this, this.camera, renderer.domElement);
    this.resurgence = true;
    this.stormTick = 0;
    this.focusHarvest = null;
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
  }

  // ------------------------------------------------------------ match flow

  start() {
    this.running = true;
    this.phase = 'bus';
    this.setupBus();
    for (const f of this.fighters) {
      f.reset();
      f.state = 'bus';
      f.model.root.visible = false;
    }
    this.controller.camYaw = Math.atan2(-this.bus.dir.x, -this.bus.dir.z) + Math.PI * 0.35;
    this.controller.camPitch = -0.35;
    this.hud.show(true);
    this.hud.message('BATTLE BUS', 'Press SPACE to jump', 4);
    sfx('horn');
    this.controller.lock();
    this.clock.start();
    requestAnimationFrame(this.loop);
  }

  setupBus() {
    const a = Math.random() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(rand(-50, 50));
    const start = dir.clone().multiplyScalar(-300).add(perp);
    const end = dir.clone().multiplyScalar(300).add(perp);
    start.y = end.y = 115;
    const mesh = busMesh();
    this.scene.add(mesh);
    mesh.lookAt(mesh.position.clone().sub(dir));
    this.bus = { start, end, dir, pos: start.clone(), t: 0, duration: 30, timeLeft: 30, mesh };
    mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
  }

  jumpFromBus(f) {
    if (f.state !== 'bus') return;
    if (this.bus.t < 1.5) return; // doors open after a moment
    f.state = 'skydive';
    f.pos.copy(this.bus.pos).add(new THREE.Vector3(rand(-1, 1), -4, rand(-1, 1)));
    f.vel.copy(this.bus.dir).multiplyScalar(8);
    f.model.root.visible = true;
    if (f.isPlayer) this.hud.message('', 'Look down + W to dive. SPACE opens the glider.', 3);
  }

  updateBus(dt) {
    const b = this.bus;
    b.t += dt;
    b.timeLeft = Math.max(0, b.duration - b.t);
    const k = Math.min(1, b.t / b.duration);
    b.pos.lerpVectors(b.start, b.end, k);
    b.mesh.position.copy(b.pos).add(new THREE.Vector3(0, -2, 0));
    b.mesh.position.y += Math.sin(this.time * 2) * 0.3;

    for (const f of this.fighters) {
      if (f.state !== 'bus') continue;
      if (!f.isPlayer && f.brain && b.t > 1.5) {
        const d = Math.hypot(b.pos.x - f.brain.dropTarget.x, b.pos.z - f.brain.dropTarget.y);
        const passed = f.brain.prevBusDist !== undefined && d > f.brain.prevBusDist;
        f.brain.prevBusDist = d;
        if ((passed || d < 25) && (f.brain.jumpDelay -= dt) <= 0) this.jumpFromBus(f);
      }
      if (f.state === 'bus') f.pos.copy(b.pos);
    }
    if (k >= 1) {
      for (const f of this.fighters) if (f.state === 'bus') this.jumpFromBus(f);
      this.scene.remove(b.mesh);
      this.phase = 'play';
      this.storm.start();
      this.hud.message('STORM EYE FORMING', 'Check your map (M)', 3);
    }
  }

  aliveCount() {
    return this.fighters.filter((f) => !f.eliminated).length;
  }

  // ------------------------------------------------------------ physics

  physics(f, dt) {
    if (f.state === 'bus' || !f.alive) return;
    const col = this.collision;
    if (f.state === 'skydive') {
      f.vel.y = -(f.dive || (f.brain && f.brain.dive) ? PLAYER.skydiveDive : PLAYER.skydiveFall);
      f.onGround = false;
      col.moveBody(f, dt);
      const above = f.pos.y - f.groundY;
      if (above < PLAYER.autoGlideHeight && !f.onGround) {
        f.state = 'glide';
        if (f.isPlayer) sfx('glider');
      }
      if (f.onGround) this.land(f);
    } else if (f.state === 'glide') {
      f.vel.y = -PLAYER.glideFall;
      f.onGround = false;
      col.moveBody(f, dt);
      if (f.onGround || f.swimming) this.land(f);
    } else {
      f.vel.y -= PLAYER.gravity * dt;
      if (f.swimming && f.vel.y < -2) f.vel.y = -2;
      col.moveBody(f, dt);
    }
  }

  land(f) {
    f.state = 'ground';
    f.vel.y = 0;
    if (f.isPlayer) this.hud.message('', '', 0.01);
  }

  // ------------------------------------------------------------ loot

  pickupItem(f, pk) {
    const left = f.give(pk.item);
    if (left === null) this.loot.remove(pk);
    else pk.item = left;
    if (f.isPlayer) sfx('pickup');
  }

  autoPickup() {
    for (const f of this.fighters) {
      if (!f.alive || f.state !== 'ground') continue;
      for (let i = this.loot.pickups.length - 1; i >= 0; i--) {
        const pk = this.loot.pickups[i];
        if (!pk.settled || pk.age < 0.6) continue;
        const dx = pk.pos.x - f.pos.x, dz = pk.pos.z - f.pos.z, dy = pk.pos.y - f.pos.y;
        if (dx * dx + dz * dz > 1.7 * 1.7 || Math.abs(dy) > 1.8) continue;
        const k = pk.item.kind;
        // Ammo and materials always auto-pick; weapons/heals only into empty slots.
        if (k === 'ammo' || k === 'mat') this.pickupItem(f, pk);
        else if (pk.age > 1.5 && f.slots.includes(null)) this.pickupItem(f, pk);
      }
    }
  }

  // ------------------------------------------------------------ deaths

  eliminate(target, source, weaponName) {
    if (!target.alive) return;
    target.alive = false;
    target.state = 'dead';
    target.heal = null;
    target.model.root.visible = false;
    this.fx.burst(target.pos.clone().add(new THREE.Vector3(0, 1, 0)), target.outfit.shirt, 14, 6, 1.5);
    this.fx.burst(target.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), '#7fd0ff', 10, 5, 1);
    for (const it of target.dropAll()) this.loot.drop(it, target.pos.clone().add(new THREE.Vector3(0, 1, 0)), true);

    const killer = source && source !== target ? source : (target.lastHitBy && this.time - target.lastHitBy.t < 10 ? target.lastHitBy.f : null);
    if (killer) killer.kills++;
    const text = killer
      ? `${killer.name} eliminated ${target.name}${weaponName ? ` with ${weaponName}` : ''}`
      : `${target.name} was eliminated by ${weaponName || 'the Storm'}`;
    this.hud.feed(text, target.isPlayer || (killer && killer.isPlayer));
    if (killer && killer.isPlayer) {
      sfx('elim');
      this.hud.message('', `ELIMINATED ${target.name.toUpperCase()}`, 2);
    }

    if (this.resurgence) {
      target.respawnT = RESURGENCE_DELAY;
      if (target.isPlayer) this.spectate = killer && killer.alive ? killer : null;
    } else {
      target.eliminated = true;
      target.placement = this.aliveCount() + 1;
      if (target.isPlayer) {
        this.spectate = killer && killer.alive ? killer : null;
        this.endMatch(false);
        return;
      }
    }
    this.checkWin();
  }

  checkWin() {
    if (this.phase === 'over') return;
    const left = this.fighters.filter((f) => !f.eliminated);
    if (left.length === 1 && left[0].isPlayer && !this.resurgence) this.endMatch(true);
  }

  respawn(f) {
    f.reset();
    // Redeploy over a random spot inside the safe zone, Rebirth style.
    const c = this.storm.mode === 'idle' ? { x: 0, y: 0 } : this.storm.next.c;
    const r = this.storm.mode === 'idle' ? 150 : Math.max(10, this.storm.next.r * 0.8);
    let x = 0, z = 0;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      x = c.x + Math.cos(a) * d; z = c.y + Math.sin(a) * d;
      if (terrainHeight(x, z) > 2) break;
    }
    f.pos.set(x, terrainHeight(x, z) + 95, z);
    f.vel.set(0, 0, 0);
    f.state = 'skydive';
    f.model.root.visible = true;
    if (f.brain) {
      f.brain.resetForDrop();
      f.brain.dropTarget.set(x + rand(-30, 30), z + rand(-30, 30));
    }
    if (f.isPlayer) {
      this.controller.resetModes();
      this.spectate = null;
      this.hud.message('REDEPLOYED', 'Find a weapon fast!', 2.5);
    }
  }

  endMatch(won) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    const end = document.getElementById('end');
    const title = end.querySelector('.end-title');
    const sub = end.querySelector('.end-sub');
    if (won) {
      title.textContent = '#1 VICTORY ROYALE';
      title.className = 'end-title';
      sfx('victory');
    } else {
      title.textContent = `#${this.player.placement || this.aliveCount() + 1}`;
      title.className = 'end-title lose';
    }
    sub.textContent = `${this.player.kills} elimination${this.player.kills === 1 ? '' : 's'}`;
    setTimeout(() => {
      end.classList.remove('hidden');
      document.exitPointerLock?.();
    }, won ? 600 : 2500);
  }

  onLockChange(locked) {
    if (!this.running || this.phase === 'over') return;
    this.paused = !locked;
    document.getElementById('pause').classList.toggle('hidden', locked);
  }

  // ------------------------------------------------------------ main loop

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.paused) this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    this.time += dt;
    if (this.phase === 'bus') this.updateBus(dt);

    this.controller.update(dt);
    for (const f of this.fighters) {
      if (f.brain && f.alive) f.brain.update(dt);
    }
    for (const f of this.fighters) this.physics(f, dt);
    this.combat.update(dt);
    this.autoPickup();

    // Storm.
    if (this.phase === 'play' || this.phase === 'over') {
      const ev = this.storm.update(dt);
      if (ev === 'shrinking') {
        this.hud.message('STORM EYE SHRINKING', '', 3);
        sfx('storm', 0.6);
      } else if (ev === 'newPhase') {
        if (this.resurgence && this.storm.phase >= RESURGENCE_END_PHASE) {
          this.resurgence = false;
          this.hud.message('RESURGENCE OFF', 'No more redeploys. Every life counts.', 4);
          for (const f of this.fighters) {
            if (!f.alive && !f.eliminated) {
              f.eliminated = true;
              f.placement = this.aliveCount() + 1;
              if (f.isPlayer) this.endMatch(false);
            }
          }
          this.checkWin();
        } else {
          this.hud.message('STORM EYE FORMING', 'Check your map (M)', 3);
        }
      }
      this.stormTick -= dt;
      if (this.stormTick <= 0) {
        this.stormTick = 1;
        for (const f of this.fighters) {
          if (f.alive && f.state !== 'bus' && this.storm.outside(f.pos)) {
            this.combat.applyDamage(f, this.storm.damage, null, { storm: true });
          }
        }
      }
    }

    // Resurgence redeploys.
    for (const f of this.fighters) {
      if (!f.alive && !f.eliminated && f.respawnT !== undefined) {
        f.respawnT -= dt;
        if (f.isPlayer) this.hud.setPrompt(`Redeploying in ${Math.ceil(Math.max(0, f.respawnT))}...`);
        if (f.respawnT <= 0 && this.resurgence) {
          f.respawnT = undefined;
          this.respawn(f);
        }
      }
    }
    if (this.spectate && !this.spectate.alive) this.spectate = this.fighters.find((f) => f.alive && !f.isPlayer) || null;

    this.builds.update(dt);
    this.loot.update(dt, this.time);
    this.world.update(dt, this.time, this.focusHarvest);
    for (const f of this.fighters) if (f.alive && f.state !== 'bus') f.updateModel(dt, this.time);
    this.fx.update(dt);
    this.hud.update(dt, this);

    // Keep the shadow camera centred on the action.
    const focus = this.player.alive ? this.player.pos : this.camera.position;
    this.sun.position.set(focus.x + 80, focus.y + 140, focus.z + 50);
    this.sun.target.position.set(focus.x, focus.y, focus.z);
    if (this.world.clouds) this.world.clouds.position.x = (this.time * 1.5) % 200;
  }
}
