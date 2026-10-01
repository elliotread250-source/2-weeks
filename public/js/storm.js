// The storm: a shrinking safe circle. Phases come from config.STORM_PHASES.
import * as THREE from 'three';
import { STORM_PHASES, STORM_START_RADIUS } from './config.js';
import { terrainHeight } from './terrain.js';
import { lerp } from './util.js';

export class Storm {
  constructor(scene) {
    this.scene = scene;
    this.center = new THREE.Vector2(0, 10);
    this.radius = STORM_START_RADIUS;
    this.phase = -1;
    this.mode = 'idle';
    this.timer = 0;
    this.from = { c: this.center.clone(), r: this.radius };
    this.next = { c: this.center.clone(), r: this.radius };

    const geo = new THREE.CylinderGeometry(1, 1, 400, 96, 1, true);
    geo.translate(0, 150, 0);
    this.wallMat = new THREE.MeshBasicMaterial({
      color: '#a64dff', transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false,
    });
    this.wall = new THREE.Mesh(geo, this.wallMat);
    this.wall.renderOrder = 5;
    scene.add(this.wall);
    this.sync();
  }

  pickNext(r) {
    // Next circle sits fully inside the current one and centres on land.
    for (let i = 0; i < 60; i++) {
      const maxOff = Math.max(0, this.radius - r);
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * maxOff * 0.85;
      const c = new THREE.Vector2(this.center.x + Math.cos(a) * d, this.center.y + Math.sin(a) * d);
      if (terrainHeight(c.x, c.y) > 2 || i === 59) return c;
    }
    return this.center.clone();
  }

  start() {
    this.phase = 0;
    this.mode = 'wait';
    this.timer = STORM_PHASES[0].wait;
    this.next = { c: this.pickNext(STORM_PHASES[0].radius), r: STORM_PHASES[0].radius };
  }

  get damage() {
    if (this.phase < 0) return 0;
    return STORM_PHASES[Math.min(this.phase, STORM_PHASES.length - 1)].damage;
  }

  update(dt) {
    if (this.mode === 'idle' || this.mode === 'done') return null;
    this.timer -= dt;
    let event = null;
    const ph = STORM_PHASES[this.phase];
    if (this.mode === 'wait') {
      if (this.timer <= 0) {
        this.mode = 'shrink';
        this.timer = ph.shrink;
        this.from = { c: this.center.clone(), r: this.radius };
        event = 'shrinking';
      }
    } else if (this.mode === 'shrink') {
      const t = 1 - Math.max(0, this.timer) / ph.shrink;
      this.center.set(lerp(this.from.c.x, this.next.c.x, t), lerp(this.from.c.y, this.next.c.y, t));
      this.radius = lerp(this.from.r, this.next.r, t);
      if (this.timer <= 0) {
        this.phase++;
        if (this.phase >= STORM_PHASES.length) {
          this.mode = 'done';
          this.phase = STORM_PHASES.length - 1;
        } else {
          const np = STORM_PHASES[this.phase];
          this.mode = 'wait';
          this.timer = np.wait;
          this.next = { c: this.pickNext(np.radius), r: np.radius };
          event = 'newPhase';
        }
      }
    }
    this.sync();
    return event;
  }

  sync() {
    const r = Math.max(0.5, this.radius);
    this.wall.scale.set(r, 1, r);
    this.wall.position.set(this.center.x, -20, this.center.y);
  }

  outside(pos) {
    return Math.hypot(pos.x - this.center.x, pos.z - this.center.y) > this.radius;
  }

  outsideNext(pos, margin = 0) {
    return Math.hypot(pos.x - this.next.c.x, pos.z - this.next.c.y) > this.next.r - margin;
  }
}
