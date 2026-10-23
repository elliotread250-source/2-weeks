// A small self-contained 3D stage: one character on a lit platform in its own
// canvas. Used by the locker preview now, and by the lobby and shop later.
import * as THREE from 'three';
import { buildRig } from './rig.js';
import { Animator } from './animator.js';
import { pickaxeMesh, gliderMesh } from './cosmetics.js';
import { gunMesh } from './character.js';
import { resolveOutfit, item } from '/shared/cosmetics/catalog.js';

export class CharacterStage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#dfeaff', '#40507a', 1.5));
    const key = new THREE.DirectionalLight('#fff4e0', 2.2);
    key.position.set(2, 4, -3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#7fb2ff', 1.2);
    rim.position.set(-3, 2, 3);
    this.scene.add(rim);
    const spot = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.25, 0.12, 40),
      new THREE.MeshLambertMaterial({ color: '#2b3a67', emissive: '#10183a' }),
    );
    spot.position.y = -0.06;
    this.scene.add(spot);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.03, 8, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe94a' }));
    ring.position.y = 0.0;
    this.scene.add(ring);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    this.zoom = 4.6;
    this.yaw = Math.PI * 0.12;
    this.height = 1.0;
    this.rig = null;
    this.animator = null;
    this.extra = null;
    this.loadout = null;
    this.clock = new THREE.Clock();
    this.bind();
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  bind() {
    let dragging = false, lx = 0;
    this.canvas.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointerup', () => { dragging = false; });
    this.canvas.addEventListener('pointermove', (e) => { if (dragging) { this.yaw += (e.clientX - lx) * 0.01; lx = e.clientX; } });
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.max(2.6, Math.min(7, this.zoom + e.deltaY * 0.004)); }, { passive: false });
    new ResizeObserver(() => this.resize()).observe(this.canvas);
  }

  resize() {
    const w = this.canvas.clientWidth || 400, h = this.canvas.clientHeight || 500;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Build the character for a loadout (cheap enough to rebuild on every change).
  setLoadout(loadout) {
    this.loadout = loadout;
    const had = this.rig;
    if (had) this.scene.remove(had.root);
    this.rig = buildRig(resolveOutfit(loadout));
    this.scene.add(this.rig.root);
    this.animator = new Animator(this.rig);
    this.setHeld('pickaxe');
    this.playLoop('idle');
    if (this.extra) { this.scene.remove(this.extra); this.extra = null; }
  }

  setHeld(kind) {
    const sock = this.rig.sockets.right;
    if (this.held) sock.remove(this.held);
    this.held = null;
    const lo = this.loadout || {};
    if (kind === 'pickaxe') this.held = pickaxeMesh(lo.pickaxe);
    else if (kind) this.held = gunMesh(kind, 3, lo.wrap);
    if (this.held) { this.held.rotation.x = -Math.PI / 2; sock.add(this.held); }
    this.heldKind = kind;
  }

  playLoop(name) {
    for (const l of [this.animator.lower, this.animator.upper]) l.play(name, { restart: true, fade: 0.15 });
    this.animator.oneShotUntil = Infinity; // the stage drives the clip itself
  }

  playEmote(clipId) {
    this.setHeld(null);
    this.playLoop(`emote.${clipId}`);
  }

  idle() {
    this.setHeld(this.heldKind || 'pickaxe');
    this.playLoop('pickaxe.idle');
    this.animator.lower.play('idle', { restart: true, fade: 0.15 });
  }

  // Show a non-outfit object next to or instead of the character (glider, contrail).
  showGlider(id) {
    if (this.extra) this.scene.remove(this.extra);
    this.extra = gliderMesh(id);
    this.rig.root.add(this.extra);
    this.playLoop('gliderLoop');
    this.setHeld(null);
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.rig) return;
    this.animator.mixer.update(dt);
    if (this.rig.fxUpdate) this.rig.fxUpdate(this.clock.elapsedTime);
    this.rig.root.rotation.y = this.yaw;
    this.camera.position.set(0, this.height + 0.3, -this.zoom);
    this.camera.lookAt(0, this.height, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }
}

void item;
