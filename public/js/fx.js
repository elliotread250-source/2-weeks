// Visual effects: bullet tracers, impact sparks, build debris, explosions and
// Fortnite-style floating damage numbers.
import * as THREE from 'three';
import { glowTexture } from './textures.js';

export class FX {
  constructor(scene, camera, container) {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    this.tracers = [];
    this.particles = [];
    this.numbers = [];
    this.flashes = [];
    this.tracerMat = new THREE.LineBasicMaterial({ color: '#fff6c2', transparent: true, opacity: 0.9 });
    this.partGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    this.partMats = new Map();
    this.flashMat = new THREE.SpriteMaterial({ map: glowTexture('#ffd27a'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.boomMat = new THREE.SpriteMaterial({ map: glowTexture('#ff8a3d'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.v = new THREE.Vector3();
  }

  mat(color) {
    if (!this.partMats.has(color)) this.partMats.set(color, new THREE.MeshLambertMaterial({ color }));
    return this.partMats.get(color);
  }

  tracer(from, to, color = null) {
    const g = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const m = color ? new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }) : this.tracerMat.clone();
    const line = new THREE.Line(g, m);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.08, max: 0.08 });
  }

  muzzle(pos) {
    const s = new THREE.Sprite(this.flashMat);
    s.position.copy(pos);
    s.scale.set(0.7, 0.7, 1);
    this.scene.add(s);
    this.flashes.push({ s, life: 0.05, max: 0.05, grow: 0 });
  }

  burst(pos, color, n = 6, speed = 4, size = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.partGeo, this.mat(color));
      m.position.copy(pos);
      m.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      this.scene.add(m);
      this.particles.push({
        m, life: 0.5 + Math.random() * 0.4,
        vel: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed),
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0),
      });
    }
  }

  explosion(pos, radius) {
    const s = new THREE.Sprite(this.boomMat);
    s.position.copy(pos);
    s.scale.set(radius, radius, 1);
    this.scene.add(s);
    this.flashes.push({ s, life: 0.45, max: 0.45, grow: radius * 3 });
    this.burst(pos, '#555555', 14, 10, 2.5);
    this.burst(pos, '#ff9f43', 10, 8, 2);
  }

  // Floating damage number. Blue = shield, white = health, yellow = headshot.
  damageNumber(worldPos, amount, kind) {
    const el = document.createElement('div');
    el.className = `dmg-num ${kind}`;
    el.textContent = Math.round(amount);
    this.container.appendChild(el);
    this.numbers.push({
      el, pos: worldPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)),
      life: 0.9, rise: 0,
    });
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / t.max);
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.grow) {
        const s = f.s.scale.x + f.grow * dt;
        f.s.scale.set(s, s, 1);
        f.s.material.opacity = Math.max(0, f.life / f.max);
      }
      if (f.life <= 0) {
        this.scene.remove(f.s);
        this.flashes.splice(i, 1);
      }
    }
    if (this.flashes.length === 0) this.boomMat.opacity = 1;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 18 * dt;
      p.m.position.addScaledVector(p.vel, dt);
      p.m.rotation.x += p.spin.x * dt;
      p.m.rotation.y += p.spin.y * dt;
      if (p.life <= 0) {
        this.scene.remove(p.m);
        this.particles.splice(i, 1);
      }
    }
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.life -= dt;
      n.rise += dt * 1.2;
      this.v.copy(n.pos);
      this.v.y += n.rise;
      this.v.project(this.camera);
      if (n.life <= 0 || this.v.z > 1) {
        if (n.life <= 0) {
          n.el.remove();
          this.numbers.splice(i, 1);
          continue;
        }
        n.el.style.display = 'none';
        continue;
      }
      n.el.style.display = 'block';
      n.el.style.transform = `translate(${(this.v.x * 0.5 + 0.5) * w}px, ${(-this.v.y * 0.5 + 0.5) * h}px) translate(-50%, -50%) scale(${0.8 + Math.min(1, n.life) * 0.4})`;
      n.el.style.opacity = Math.min(1, n.life * 2.5);
    }
  }
}
